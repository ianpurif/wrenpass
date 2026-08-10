import { Buffer } from "buffer";
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";

export interface RedemptionRequestAuthorizationInput {
  contractId: string;
  merchant: string;
  owner: string;
  passId: bigint;
  serializedTransaction: string;
  expiresAtLedger: number;
}

export class RedemptionRequestAuthorizationError extends Error {}

export function assertRedemptionRequestAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  input: RedemptionRequestAuthorizationInput,
): void {
  const credentials = entry.credentials();
  if (credentials.switch().name !== "sorobanCredentialsAddress") {
    throw new RedemptionRequestAuthorizationError(
      "The redemption request authorization has invalid credentials.",
    );
  }
  const authorizedAddress = Address.fromScAddress(
    credentials.address().address(),
  ).toString();
  if (authorizedAddress !== input.merchant) {
    throw new RedemptionRequestAuthorizationError(
      "The redemption request authorization belongs to another wallet.",
    );
  }

  const root = entry.rootInvocation();
  if (
    root.function().switch().name !== "sorobanAuthorizedFunctionTypeContractFn" ||
    root.subInvocations().length !== 0
  ) {
    throw new RedemptionRequestAuthorizationError(
      "The redemption request authorization contains unexpected actions.",
    );
  }
  const call = root.function().contractFn();
  const contractId = Address.fromScAddress(call.contractAddress()).toString();
  const functionName = Buffer.from(call.functionName()).toString("utf8");
  const args = call.args().map((argument) => scValToNative(argument) as unknown);
  if (
    contractId !== input.contractId ||
    functionName !== "create_request" ||
    args.length !== 5 ||
    args[0] !== input.merchant ||
    args[1] !== input.owner ||
    args[2] !== input.passId ||
    args[3] !== input.serializedTransaction ||
    args[4] !== input.expiresAtLedger
  ) {
    throw new RedemptionRequestAuthorizationError(
      "The redemption request authorization does not match this pass.",
    );
  }
}
