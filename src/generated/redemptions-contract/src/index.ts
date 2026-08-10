import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidTransaction"},
  4: {message:"InvalidExpiration"},
  5: {message:"PassNotFound"},
  6: {message:"CampaignNotFound"},
  7: {message:"PassNotActive"},
  8: {message:"Unauthorized"},
  9: {message:"CampaignUnavailable"},
  10: {message:"PassExpired"},
  11: {message:"InvalidPageSize"},
  12: {message:"Overflow"}
}

export type PassStatus = {tag: "Active", values: void} | {tag: "Redeemed", values: void} | {tag: "Expired", values: void} | {tag: "Refunded", values: void};


export interface RequestPage {
  next_cursor: u64;
  requests: Array<RedemptionRequest>;
}


export interface PassSnapshot {
  campaign_id: u64;
  id: u64;
  owner: string;
  purchase_amounts: PurchaseAmounts;
  purchased_at: u64;
  status: PassStatus;
}

export type CampaignStatus = {tag: "Draft", values: void} | {tag: "Active", values: void} | {tag: "Paused", values: void} | {tag: "Expired", values: void} | {tag: "Cancelled", values: void};


export interface FinancialRules {
  merchant_bps: u32;
  platform_fee_bps: u32;
  reserve_bps: u32;
}


export interface RegistryConfig {
  campaign_contract: string;
}


export interface PurchaseAmounts {
  merchant_release: i128;
  platform_fee: i128;
  protected_reserve: i128;
  total: i128;
}


export interface CampaignSnapshot {
  cancellation_funds: i128;
  cancellation_shortfall: i128;
  created_at: u64;
  expires_at: u64;
  financial_rules: FinancialRules;
  id: u64;
  max_supply: u32;
  merchant: string;
  merchant_released: i128;
  pass_price: i128;
  payment_asset: string;
  platform: string;
  platform_fees_paid: i128;
  protected_funds: i128;
  redeemed: u32;
  refunded: u32;
  service_value: i128;
  sold: u32;
  status: CampaignStatus;
}


export interface RedemptionRequest {
  campaign_id: u64;
  created_at: u64;
  expires_at_ledger: u32;
  merchant: string;
  owner: string;
  pass_id: u64;
  serialized_transaction: string;
}


export interface Client {
  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<RegistryConfig>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({initializer, campaign_contract}: {initializer: string, campaign_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_request transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_request: ({pass_id}: {pass_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<RedemptionRequest>>>

  /**
   * Construct and simulate a create_request transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_request: ({merchant, owner, pass_id, serialized_transaction, expires_at_ledger}: {merchant: string, owner: string, pass_id: u64, serialized_transaction: string, expires_at_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RedemptionRequest>>>

  /**
   * Construct and simulate a storage_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  storage_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_owner_requests transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_owner_requests: ({owner, cursor, limit}: {owner: string, cursor: u64, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<RequestPage>>>

  /**
   * Construct and simulate a owner_request_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_request_count: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAASSW52YWxpZFRyYW5zYWN0aW9uAAAAAAADAAAAAAAAABFJbnZhbGlkRXhwaXJhdGlvbgAAAAAAAAQAAAAAAAAADFBhc3NOb3RGb3VuZAAAAAUAAAAAAAAAEENhbXBhaWduTm90Rm91bmQAAAAGAAAAAAAAAA1QYXNzTm90QWN0aXZlAAAAAAAABwAAAAAAAAAMVW5hdXRob3JpemVkAAAACAAAAAAAAAATQ2FtcGFpZ25VbmF2YWlsYWJsZQAAAAAJAAAAAAAAAAtQYXNzRXhwaXJlZAAAAAAKAAAAAAAAAA9JbnZhbGlkUGFnZVNpemUAAAAACwAAAAAAAAAIT3ZlcmZsb3cAAAAM",
        "AAAAAgAAAAAAAAAAAAAAClBhc3NTdGF0dXMAAAAAAAQAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACFJlZGVlbWVkAAAAAAAAAAAAAAAHRXhwaXJlZAAAAAAAAAAAAAAAAAhSZWZ1bmRlZA==",
        "AAAAAQAAAAAAAAAAAAAAC1JlcXVlc3RQYWdlAAAAAAIAAAAAAAAAC25leHRfY3Vyc29yAAAAAAYAAAAAAAAACHJlcXVlc3RzAAAD6gAAB9AAAAARUmVkZW1wdGlvblJlcXVlc3QAAAA=",
        "AAAAAQAAAAAAAAAAAAAADFBhc3NTbmFwc2hvdAAAAAYAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAEHB1cmNoYXNlX2Ftb3VudHMAAAfQAAAAD1B1cmNoYXNlQW1vdW50cwAAAAAAAAAADHB1cmNoYXNlZF9hdAAAAAYAAAAAAAAABnN0YXR1cwAAAAAH0AAAAApQYXNzU3RhdHVzAAA=",
        "AAAAAgAAAAAAAAAAAAAADkNhbXBhaWduU3RhdHVzAAAAAAAFAAAAAAAAAAAAAAAFRHJhZnQAAAAAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAAHRXhwaXJlZAAAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=",
        "AAAAAQAAAAAAAAAAAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAADAAAAAAAAAAxtZXJjaGFudF9icHMAAAAEAAAAAAAAABBwbGF0Zm9ybV9mZWVfYnBzAAAABAAAAAAAAAALcmVzZXJ2ZV9icHMAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADlJlZ2lzdHJ5Q29uZmlnAAAAAAABAAAAAAAAABFjYW1wYWlnbl9jb250cmFjdAAAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAAD1B1cmNoYXNlQW1vdW50cwAAAAAEAAAAAAAAABBtZXJjaGFudF9yZWxlYXNlAAAACwAAAAAAAAAMcGxhdGZvcm1fZmVlAAAACwAAAAAAAAARcHJvdGVjdGVkX3Jlc2VydmUAAAAAAAALAAAAAAAAAAV0b3RhbAAAAAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAAEENhbXBhaWduU25hcHNob3QAAAATAAAAAAAAABJjYW5jZWxsYXRpb25fZnVuZHMAAAAAAAsAAAAAAAAAFmNhbmNlbGxhdGlvbl9zaG9ydGZhbGwAAAAAAAsAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAD2ZpbmFuY2lhbF9ydWxlcwAAAAfQAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAptYXhfc3VwcGx5AAAAAAAEAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAAEW1lcmNoYW50X3JlbGVhc2VkAAAAAAAACwAAAAAAAAAKcGFzc19wcmljZQAAAAAACwAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAACHBsYXRmb3JtAAAAEwAAAAAAAAAScGxhdGZvcm1fZmVlc19wYWlkAAAAAAALAAAAAAAAAA9wcm90ZWN0ZWRfZnVuZHMAAAAACwAAAAAAAAAIcmVkZWVtZWQAAAAEAAAAAAAAAAhyZWZ1bmRlZAAAAAQAAAAAAAAADXNlcnZpY2VfdmFsdWUAAAAAAAALAAAAAAAAAARzb2xkAAAABAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADkNhbXBhaWduU3RhdHVzAAA=",
        "AAAAAQAAAAAAAAAAAAAAEVJlZGVtcHRpb25SZXF1ZXN0AAAAAAAABwAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAARZXhwaXJlc19hdF9sZWRnZXIAAAAAAAAEAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHcGFzc19pZAAAAAAGAAAAAAAAABZzZXJpYWxpemVkX3RyYW5zYWN0aW9uAAAAAAAQ",
        "AAAABQAAAAAAAAAAAAAAE1JlZGVtcHRpb25SZXF1ZXN0ZWQAAAAAAQAAABRyZWRlbXB0aW9uX3JlcXVlc3RlZAAAAAUAAAAAAAAAB3Bhc3NfaWQAAAAABgAAAAEAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAAAAAAABFleHBpcmVzX2F0X2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAA5SZWdpc3RyeUNvbmZpZwAAAAAAAw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAALaW5pdGlhbGl6ZXIAAAAAEwAAAAAAAAARY2FtcGFpZ25fY29udHJhY3QAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALZ2V0X3JlcXVlc3QAAAAAAQAAAAAAAAAHcGFzc19pZAAAAAAGAAAAAQAAA+gAAAfQAAAAEVJlZGVtcHRpb25SZXF1ZXN0AAAA",
        "AAAAAAAAAAAAAAAOY3JlYXRlX3JlcXVlc3QAAAAAAAUAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdwYXNzX2lkAAAAAAYAAAAAAAAAFnNlcmlhbGl6ZWRfdHJhbnNhY3Rpb24AAAAAABAAAAAAAAAAEWV4cGlyZXNfYXRfbGVkZ2VyAAAAAAAABAAAAAEAAAPpAAAH0AAAABFSZWRlbXB0aW9uUmVxdWVzdAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAASZ2V0X293bmVyX3JlcXVlc3RzAAAAAAADAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAABmN1cnNvcgAAAAAABgAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+kAAAfQAAAAC1JlcXVlc3RQYWdlAAAAAAM=",
        "AAAAAAAAAAAAAAATb3duZXJfcmVxdWVzdF9jb3VudAAAAAABAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_config: this.txFromJSON<Result<RegistryConfig>>,
        initialize: this.txFromJSON<Result<void>>,
        get_request: this.txFromJSON<Option<RedemptionRequest>>,
        create_request: this.txFromJSON<Result<RedemptionRequest>>,
        storage_version: this.txFromJSON<u32>,
        get_owner_requests: this.txFromJSON<Result<RequestPage>>,
        owner_request_count: this.txFromJSON<u64>
  }
}