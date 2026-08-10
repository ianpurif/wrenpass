import "server-only";

import {
  Address,
  BASE_FEE,
  Keypair,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import {
  assertRedemptionRequestAuthorization,
  RedemptionRequestAuthorizationError,
  type RedemptionRequestAuthorizationInput,
} from "@/features/redemption/request-authorization";
import {
  Client,
  type RedemptionRequest,
} from "@/generated/redemptions-contract/src";
import type { StellarConfig } from "@/lib/stellar/config";

const AUTH_VALIDITY_LEDGERS = 100;
const PAGE_SIZE = 50;
const MAX_SPONSORED_FEE_STROOPS = BigInt(1_000_000);

export interface PreparedRedemptionRequestAuthorization {
  authorizationEntry: string;
  expiresAtLedger: number;
}

export interface SponsoredRedemptionRequestResult {
  transactionHash: string;
  ledger: number;
}

interface RedemptionRpc {
  getAccount(address: string): ReturnType<rpc.Server["getAccount"]>;
  getLatestLedger(): ReturnType<rpc.Server["getLatestLedger"]>;
  simulateTransaction(
    transaction: Parameters<rpc.Server["simulateTransaction"]>[0],
  ): ReturnType<rpc.Server["simulateTransaction"]>;
  prepareTransaction(
    transaction: Parameters<rpc.Server["prepareTransaction"]>[0],
  ): ReturnType<rpc.Server["prepareTransaction"]>;
  sendTransaction(
    transaction: Parameters<rpc.Server["sendTransaction"]>[0],
  ): ReturnType<rpc.Server["sendTransaction"]>;
  pollTransaction(
    hash: string,
    options?: Parameters<rpc.Server["pollTransaction"]>[1],
  ): ReturnType<rpc.Server["pollTransaction"]>;
}

let submissionQueue: Promise<void> = Promise.resolve();

function enqueueSubmission<T>(task: () => Promise<T>): Promise<T> {
  const result = submissionQueue.then(task, task);
  submissionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function requestArguments(input: RedemptionRequestAuthorizationInput): xdr.ScVal[] {
  return [
    Address.fromString(input.merchant).toScVal(),
    Address.fromString(input.owner).toScVal(),
    xdr.ScVal.scvU64(xdr.Uint64.fromString(input.passId.toString())),
    xdr.ScVal.scvString(input.serializedTransaction),
    xdr.ScVal.scvU32(input.expiresAtLedger),
  ];
}

function buildRequestOperation(
  input: RedemptionRequestAuthorizationInput,
  auth?: xdr.SorobanAuthorizationEntry[],
) {
  return Operation.invokeContractFunction({
    contract: input.contractId,
    function: "create_request",
    args: requestArguments(input),
    ...(auth ? { auth } : {}),
  });
}

function validateAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  input: RedemptionRequestAuthorizationInput,
): void {
  try {
    assertRedemptionRequestAuthorization(entry, input);
  } catch (error) {
    if (error instanceof RedemptionRequestAuthorizationError) {
      throw new RedemptionRegistryError(error.message);
    }
    throw new RedemptionRegistryError(
      "The signed redemption request authorization is invalid.",
    );
  }
}

function transactionResultCode(response: rpc.Api.SendTransactionResponse): string {
  return response.errorResult?.result().switch().name ?? response.status;
}

export class RedemptionRegistryError extends Error {}

export class StellarRedemptionRegistry {
  private readonly sponsor: Keypair;
  private readonly server: RedemptionRpc;

  constructor(
    private readonly config: StellarConfig,
    sponsorSecret: string,
    server?: RedemptionRpc,
  ) {
    this.sponsor = Keypair.fromSecret(sponsorSecret);
    this.server = server ?? new rpc.Server(config.rpcUrl);
  }

  private async createTransaction(
    input: Omit<RedemptionRequestAuthorizationInput, "contractId">,
    auth?: xdr.SorobanAuthorizationEntry[],
  ) {
    const account = await this.server.getAccount(this.sponsor.publicKey());
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        buildRequestOperation(
          { ...input, contractId: this.config.redemptionContractId },
          auth,
        ),
      )
      .setTimeout(60)
      .build();
  }

  async prepare(
    input: Omit<RedemptionRequestAuthorizationInput, "contractId">,
  ): Promise<PreparedRedemptionRequestAuthorization> {
    const authorizationInput = {
      ...input,
      contractId: this.config.redemptionContractId,
    };
    const simulation = await this.server.simulateTransaction(
      await this.createTransaction(input),
    );
    if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
      throw new RedemptionRegistryError(
        "The redemption request could not be prepared on Stellar.",
      );
    }
    if (simulation.result.auth.length !== 1) {
      throw new RedemptionRegistryError(
        "The redemption registry requested an unexpected authorization set.",
      );
    }
    const entry = simulation.result.auth[0];
    validateAuthorization(entry, authorizationInput);
    return {
      authorizationEntry: entry.toXDR("base64"),
      expiresAtLedger: simulation.latestLedger + AUTH_VALIDITY_LEDGERS,
    };
  }

  async submit(
    input: Omit<RedemptionRequestAuthorizationInput, "contractId"> & {
      signedAuthorizationEntry: string;
    },
  ): Promise<SponsoredRedemptionRequestResult> {
    let signedAuthorization: xdr.SorobanAuthorizationEntry;
    try {
      signedAuthorization = xdr.SorobanAuthorizationEntry.fromXDR(
        input.signedAuthorizationEntry,
        "base64",
      );
    } catch {
      throw new RedemptionRegistryError(
        "The signed redemption request authorization is invalid.",
      );
    }
    const authorizationInput = {
      merchant: input.merchant,
      owner: input.owner,
      passId: input.passId,
      serializedTransaction: input.serializedTransaction,
      expiresAtLedger: input.expiresAtLedger,
      contractId: this.config.redemptionContractId,
    };
    validateAuthorization(signedAuthorization, authorizationInput);

    const latest = await this.server.getLatestLedger();
    const credentials = signedAuthorization.credentials().address();
    const signatureExpiration = credentials.signatureExpirationLedger();
    if (
      signatureExpiration <= latest.sequence ||
      signatureExpiration > latest.sequence + AUTH_VALIDITY_LEDGERS
    ) {
      throw new RedemptionRegistryError(
        "The redemption request authorization has expired.",
      );
    }
    if (credentials.signature().switch().name === "scvVoid") {
      throw new RedemptionRegistryError(
        "The redemption request authorization is not signed.",
      );
    }

    return enqueueSubmission(async () => {
      const transaction = await this.createTransaction(input, [signedAuthorization]);
      const prepared = await this.server.prepareTransaction(transaction);
      if (BigInt(prepared.fee) > MAX_SPONSORED_FEE_STROOPS) {
        throw new RedemptionRegistryError(
          "The sponsored redemption request fee exceeded its safety limit.",
        );
      }
      prepared.sign(this.sponsor);
      const sent = await this.server.sendTransaction(prepared);
      if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
        throw new RedemptionRegistryError(
          `Stellar rejected the redemption request: ${transactionResultCode(sent)}.`,
        );
      }
      const result = await this.server.pollTransaction(sent.hash, { attempts: 15 });
      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new RedemptionRegistryError(
          result.status === rpc.Api.GetTransactionStatus.NOT_FOUND
            ? "The redemption request is still pending. Try again shortly."
            : "Stellar rejected the redemption request.",
        );
      }
      return { transactionHash: sent.hash, ledger: result.ledger };
    });
  }

  async findByOwner(owner: string): Promise<RedemptionRequest[]> {
    const client = new Client({
      contractId: this.config.redemptionContractId,
      networkPassphrase: this.config.networkPassphrase,
      rpcUrl: this.config.rpcUrl,
    });
    const requests: RedemptionRequest[] = [];
    let cursor = BigInt(0);
    while (true) {
      const transaction = await client.get_owner_requests({
        owner,
        cursor,
        limit: PAGE_SIZE,
      });
      const page = transaction.result.unwrap();
      requests.push(...page.requests);
      if (page.next_cursor <= cursor) break;
      cursor = page.next_cursor;
      const count = await client.owner_request_count({ owner });
      if (cursor >= count.result) break;
    }
    return requests;
  }

  async findByPass(passId: bigint): Promise<RedemptionRequest | null> {
    const client = new Client({
      contractId: this.config.redemptionContractId,
      networkPassphrase: this.config.networkPassphrase,
      rpcUrl: this.config.rpcUrl,
    });
    const transaction = await client.get_request({ pass_id: passId });
    return transaction.result ?? null;
  }
}
