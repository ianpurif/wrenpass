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





export interface Pass {
  campaign_id: u64;
  id: u64;
  owner: string;
  purchase_amounts: PurchaseAmounts;
  purchased_at: u64;
  status: PassStatus;
}

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"NotFound"},
  4: {message:"Unauthorized"},
  5: {message:"InvalidAmount"},
  6: {message:"InvalidSupply"},
  7: {message:"InvalidExpiration"},
  8: {message:"InvalidFinancialRules"},
  9: {message:"InvalidState"},
  10: {message:"CampaignExpired"},
  11: {message:"Overflow"},
  12: {message:"InvalidConfiguration"},
  13: {message:"SoldOut"},
  14: {message:"InsufficientBalance"},
  15: {message:"PassNotActive"},
  16: {message:"PassExpired"},
  17: {message:"RefundNotAvailable"},
  18: {message:"InvalidRecipient"},
  19: {message:"InvalidPageSize"}
}


export interface Campaign {
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

export type PassStatus = {tag: "Active", values: void} | {tag: "Redeemed", values: void} | {tag: "Expired", values: void} | {tag: "Refunded", values: void};





export interface CampaignTerms {
  expires_at: u64;
  financial_rules: FinancialRules;
  max_supply: u32;
  pass_price: i128;
  service_value: i128;
}


export type CampaignStatus = {tag: "Draft", values: void} | {tag: "Active", values: void} | {tag: "Paused", values: void} | {tag: "Expired", values: void} | {tag: "Cancelled", values: void};


export interface ContractConfig {
  payment_asset: string;
  platform: string;
}


export interface FinancialRules {
  merchant_bps: u32;
  platform_fee_bps: u32;
  reserve_bps: u32;
}


export interface PurchaseAmounts {
  merchant_release: i128;
  platform_fee: i128;
  protected_reserve: i128;
  total: i128;
}




export interface IndexMigrationStatus {
  campaign_cursor: u64;
  campaigns_complete: boolean;
  pass_cursor: u64;
  passes_complete: boolean;
}


export interface Client {
  /**
   * Construct and simulate a get_pass transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pass: ({pass_id}: {pass_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Pass>>>

  /**
   * Construct and simulate a purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  purchase: ({campaign_id, customer}: {campaign_id: u64, customer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a gift_pass transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  gift_pass: ({pass_id, owner, recipient}: {pass_id: u64, owner: string, recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<ContractConfig>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({platform, payment_asset}: {platform: string, payment_asset: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pass_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pass_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a redeem_pass transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  redeem_pass: ({pass_id, merchant, owner}: {pass_id: u64, merchant: string, owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund_pass transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  refund_pass: ({pass_id, owner}: {pass_id: u64, owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_campaign: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Campaign>>>

  /**
   * Construct and simulate a campaign_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  campaign_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a pause_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause_campaign: ({campaign_id, merchant}: {campaign_id: u64, merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a quote_purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quote_purchase: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<PurchaseAmounts>>>

  /**
   * Construct and simulate a cancel_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_campaign: ({campaign_id, merchant}: {campaign_id: u64, merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a create_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_campaign: ({merchant, terms}: {merchant: string, terms: CampaignTerms}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a resume_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  resume_campaign: ({campaign_id, merchant}: {campaign_id: u64, merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a storage_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  storage_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_owner_passes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_owner_passes: ({owner, cursor, limit}: {owner: string, cursor: u64, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<Pass>>>>

  /**
   * Construct and simulate a maintain_storage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  maintain_storage: ({campaign_ids, pass_ids}: {campaign_ids: Array<u64>, pass_ids: Array<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a owner_pass_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  owner_pass_count: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a publish_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  publish_campaign: ({campaign_id, merchant}: {campaign_id: u64, merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remaining_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  remaining_supply: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a migrate_pass_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  migrate_pass_index: ({limit}: {limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<IndexMigrationStatus>>>

  /**
   * Construct and simulate a get_merchant_campaigns transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_merchant_campaigns: ({merchant, cursor, limit}: {merchant: string, cursor: u64, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<Campaign>>>>

  /**
   * Construct and simulate a index_migration_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  index_migration_status: (options?: MethodOptions) => Promise<AssembledTransaction<IndexMigrationStatus>>

  /**
   * Construct and simulate a migrate_campaign_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  migrate_campaign_index: ({limit}: {limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<IndexMigrationStatus>>>

  /**
   * Construct and simulate a merchant_campaign_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  merchant_campaign_count: ({merchant}: {merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

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
      new ContractSpec([ "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",
        "AAAAAgAAAAAAAAAAAAAADkNhbXBhaWduU3RhdHVzAAAAAAAFAAAAAAAAAAAAAAAFRHJhZnQAAAAAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAAHRXhwaXJlZAAAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=",
        "AAAAAQAAAAAAAAAAAAAADkNvbnRyYWN0Q29uZmlnAAAAAAACAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAIcGxhdGZvcm0AAAAT",
        "AAAAAQAAAAAAAAAAAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAADAAAAAAAAAAxtZXJjaGFudF9icHMAAAAEAAAAAAAAABBwbGF0Zm9ybV9mZWVfYnBzAAAABAAAAAAAAAALcmVzZXJ2ZV9icHMAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAD1B1cmNoYXNlQW1vdW50cwAAAAAEAAAAAAAAABBtZXJjaGFudF9yZWxlYXNlAAAACwAAAAAAAAAMcGxhdGZvcm1fZmVlAAAACwAAAAAAAAARcHJvdGVjdGVkX3Jlc2VydmUAAAAAAAALAAAAAAAAAAV0b3RhbAAAAAAAAAs=",
        "AAAABQAAAAAAAAAAAAAAD0NhbXBhaWduQ3JlYXRlZAAAAAABAAAAEGNhbXBhaWduX2NyZWF0ZWQAAAAIAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAAAAAAAApwYXNzX3ByaWNlAAAAAAALAAAAAAAAAAAAAAANc2VydmljZV92YWx1ZQAAAAAAAAsAAAAAAAAAAAAAAAptYXhfc3VwcGx5AAAAAAAEAAAAAAAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAAAAAAD2ZpbmFuY2lhbF9ydWxlcwAAAAfQAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEUNhbXBhaWduQ2FuY2VsbGVkAAAAAAAAAQAAABJjYW1wYWlnbl9jYW5jZWxsZWQAAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAAAAAAAAhtZXJjaGFudAAAABMAAAABAAAAAAAAAAtyZXBsZW5pc2hlZAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAIZ2V0X3Bhc3MAAAABAAAAAAAAAAdwYXNzX2lkAAAAAAYAAAABAAAD6AAAB9AAAAAEUGFzcw==",
        "AAAAAAAAAAAAAAAIcHVyY2hhc2UAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAAhjdXN0b21lcgAAABMAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAAAAAAAAJZ2lmdF9wYXNzAAAAAAAAAwAAAAAAAAAHcGFzc19pZAAAAAAGAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAQAAAAAAAAAAAAAAFEluZGV4TWlncmF0aW9uU3RhdHVzAAAABAAAAAAAAAAPY2FtcGFpZ25fY3Vyc29yAAAAAAYAAAAAAAAAEmNhbXBhaWduc19jb21wbGV0ZQAAAAAAAQAAAAAAAAALcGFzc19jdXJzb3IAAAAABgAAAAAAAAAPcGFzc2VzX2NvbXBsZXRlAAAAAAE=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAA5Db250cmFjdENvbmZpZwAAAAAAAw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAIcGxhdGZvcm0AAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAKcGFzc19jb3VudAAAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAALcmVkZWVtX3Bhc3MAAAAAAwAAAAAAAAAHcGFzc19pZAAAAAAGAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALcmVmdW5kX3Bhc3MAAAAAAgAAAAAAAAAHcGFzc19pZAAAAAAGAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAD6QAAAAsAAAAD",
        "AAAABQAAAAAAAAAAAAAAFUNhbXBhaWduU3RhdHVzQ2hhbmdlZAAAAAAAAAEAAAAXY2FtcGFpZ25fc3RhdHVzX2NoYW5nZWQAAAAABAAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAAAAAAACHByZXZpb3VzAAAH0AAAAA5DYW1wYWlnblN0YXR1cwAAAAAAAAAAAAAAAAAHY3VycmVudAAAAAfQAAAADkNhbXBhaWduU3RhdHVzAAAAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAMZ2V0X2NhbXBhaWduAAAAAQAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAPoAAAH0AAAAAhDYW1wYWlnbg==",
        "AAAAAAAAAAAAAAAOY2FtcGFpZ25fY291bnQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAAAAAAAOcGF1c2VfY2FtcGFpZ24AAAAAAAIAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAOcXVvdGVfcHVyY2hhc2UAAAAAAAEAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAD6QAAB9AAAAAPUHVyY2hhc2VBbW91bnRzAAAAAAM=",
        "AAAAAAAAAAAAAAAPY2FuY2VsX2NhbXBhaWduAAAAAAIAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAPpAAAACwAAAAM=",
        "AAAAAAAAAAAAAAAPY3JlYXRlX2NhbXBhaWduAAAAAAIAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAFdGVybXMAAAAAAAfQAAAADUNhbXBhaWduVGVybXMAAAAAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAAAAAAAAPcmVzdW1lX2NhbXBhaWduAAAAAAIAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAQZ2V0X293bmVyX3Bhc3NlcwAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAGY3Vyc29yAAAAAAAGAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6QAAA+oAAAfQAAAABFBhc3MAAAAD",
        "AAAAAAAAAAAAAAAQbWFpbnRhaW5fc3RvcmFnZQAAAAIAAAAAAAAADGNhbXBhaWduX2lkcwAAA+oAAAAGAAAAAAAAAAhwYXNzX2lkcwAAA+oAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAQb3duZXJfcGFzc19jb3VudAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAG",
        "AAAAAAAAAAAAAAAQcHVibGlzaF9jYW1wYWlnbgAAAAIAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAQcmVtYWluaW5nX3N1cHBseQAAAAEAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAABAAAD6QAAAAQAAAAD",
        "AAAAAAAAAAAAAAASbWlncmF0ZV9wYXNzX2luZGV4AAAAAAABAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6QAAB9AAAAAUSW5kZXhNaWdyYXRpb25TdGF0dXMAAAAD",
        "AAAAAAAAAAAAAAAWZ2V0X21lcmNoYW50X2NhbXBhaWducwAAAAAAAwAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAAAAAAZjdXJzb3IAAAAAAAYAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPpAAAD6gAAB9AAAAAIQ2FtcGFpZ24AAAAD",
        "AAAAAAAAAAAAAAAWaW5kZXhfbWlncmF0aW9uX3N0YXR1cwAAAAAAAAAAAAEAAAfQAAAAFEluZGV4TWlncmF0aW9uU3RhdHVz",
        "AAAAAAAAAAAAAAAWbWlncmF0ZV9jYW1wYWlnbl9pbmRleAAAAAAAAQAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+kAAAfQAAAAFEluZGV4TWlncmF0aW9uU3RhdHVzAAAAAw==",
        "AAAAAAAAAAAAAAAXbWVyY2hhbnRfY2FtcGFpZ25fY291bnQAAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAY=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_pass: this.txFromJSON<Option<Pass>>,
        purchase: this.txFromJSON<Result<u64>>,
        gift_pass: this.txFromJSON<Result<void>>,
        get_config: this.txFromJSON<Result<ContractConfig>>,
        initialize: this.txFromJSON<Result<void>>,
        pass_count: this.txFromJSON<u64>,
        redeem_pass: this.txFromJSON<Result<void>>,
        refund_pass: this.txFromJSON<Result<i128>>,
        get_campaign: this.txFromJSON<Option<Campaign>>,
        campaign_count: this.txFromJSON<u64>,
        pause_campaign: this.txFromJSON<Result<void>>,
        quote_purchase: this.txFromJSON<Result<PurchaseAmounts>>,
        cancel_campaign: this.txFromJSON<Result<i128>>,
        create_campaign: this.txFromJSON<Result<u64>>,
        resume_campaign: this.txFromJSON<Result<void>>,
        storage_version: this.txFromJSON<u32>,
        get_owner_passes: this.txFromJSON<Result<Array<Pass>>>,
        maintain_storage: this.txFromJSON<Result<void>>,
        owner_pass_count: this.txFromJSON<u64>,
        publish_campaign: this.txFromJSON<Result<void>>,
        remaining_supply: this.txFromJSON<Result<u32>>,
        migrate_pass_index: this.txFromJSON<Result<IndexMigrationStatus>>,
        get_merchant_campaigns: this.txFromJSON<Result<Array<Campaign>>>,
        index_migration_status: this.txFromJSON<IndexMigrationStatus>,
        migrate_campaign_index: this.txFromJSON<Result<IndexMigrationStatus>>,
        merchant_campaign_count: this.txFromJSON<u64>
  }
}