import { Buffer } from "buffer";
import { authorizeEntry, xdr } from "@stellar/stellar-sdk";

import { redemptionApi } from "@/features/redemption/api";
import type { RedemptionRequestDto } from "@/features/redemption/dto";
import { assertRedemptionRequestAuthorization } from "@/features/redemption/request-authorization";
import type { StellarConfig } from "@/lib/stellar/config";

type SignAuthEntry = (
  authorizationXdr: string,
) => Promise<{ signedAuthEntry: string; signerAddress?: string }>;

export class StellarRedemptionRequestWriter {
  constructor(
    private readonly config: StellarConfig,
    private readonly api: Pick<
      typeof redemptionApi,
      "prepareCreate" | "submitCreate"
    > = redemptionApi,
  ) {}

  async publish(input: {
    qrPayload: string;
    serializedTransaction: string;
    expiresAtLedger: number;
    passId: bigint;
    merchant: string;
    owner: string;
    signAuthEntry: SignAuthEntry;
  }): Promise<RedemptionRequestDto> {
    const request = {
      qrPayload: input.qrPayload,
      serializedTransaction: input.serializedTransaction,
      expiresAtLedger: input.expiresAtLedger,
    };
    const prepared = await this.api.prepareCreate(request);
    const unsignedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
      prepared.authorizationEntry,
      "base64",
    );
    assertRedemptionRequestAuthorization(unsignedAuthorization, {
      contractId: this.config.redemptionContractId,
      merchant: input.merchant,
      owner: input.owner,
      passId: input.passId,
      serializedTransaction: input.serializedTransaction,
      expiresAtLedger: input.expiresAtLedger,
    });
    const signedAuthorization = await authorizeEntry(
      unsignedAuthorization,
      async (preimage) => {
        const signed = await input.signAuthEntry(preimage.toXDR("base64"));
        if (signed.signerAddress && signed.signerAddress !== input.merchant) {
          throw new Error(
            "Freighter authorized the redemption request with a different account.",
          );
        }
        return Buffer.from(signed.signedAuthEntry, "base64");
      },
      prepared.expiresAtLedger,
      this.config.networkPassphrase,
    );
    return this.api.submitCreate({
      ...request,
      signedAuthorizationEntry: signedAuthorization.toXDR("base64"),
    });
  }
}
