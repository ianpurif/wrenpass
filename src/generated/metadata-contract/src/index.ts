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
  3: {message:"InvalidBusinessName"},
  4: {message:"InvalidBusinessDescription"},
  5: {message:"InvalidCampaignName"},
  6: {message:"InvalidServiceDescription"},
  7: {message:"InvalidImage"},
  8: {message:"CampaignNotFound"},
  9: {message:"Unauthorized"},
  10: {message:"MetadataConflict"},
  11: {message:"InvalidPageSize"},
  12: {message:"Overflow"}
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


export interface MerchantProfile {
  business_name: string;
  created_at: u64;
  description: string;
  logo_sha256: Option<Buffer>;
  logo_url: Option<string>;
  owner: string;
  updated_at: u64;
}


export interface CampaignMetadata {
  campaign_id: u64;
  created_at: u64;
  image_sha256: Option<Buffer>;
  image_url: Option<string>;
  merchant: string;
  name: string;
  service_description: string;
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



export interface MerchantProfileInput {
  business_name: string;
  description: string;
  logo_sha256: Option<Buffer>;
  logo_url: Option<string>;
}


export interface CampaignMetadataInput {
  image_sha256: Option<Buffer>;
  image_url: Option<string>;
  name: string;
  service_description: string;
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
   * Construct and simulate a storage_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  storage_version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a maintain_storage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  maintain_storage: ({merchants, campaign_ids}: {merchants: Array<string>, campaign_ids: Array<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_merchant_profile transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_merchant_profile: ({merchant}: {merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<MerchantProfile>>>

  /**
   * Construct and simulate a set_merchant_profile transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_merchant_profile: ({merchant, profile}: {merchant: string, profile: MerchantProfileInput}, options?: MethodOptions) => Promise<AssembledTransaction<Result<MerchantProfile>>>

  /**
   * Construct and simulate a get_campaign_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_campaign_metadata: ({campaign_id}: {campaign_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<CampaignMetadata>>>

  /**
   * Construct and simulate a get_merchant_campaigns transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_merchant_campaigns: ({merchant, cursor, limit}: {merchant: string, cursor: u64, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<CampaignMetadata>>>>

  /**
   * Construct and simulate a merchant_campaign_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  merchant_campaign_count: ({merchant}: {merchant: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a register_campaign_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_campaign_metadata: ({campaign_id, merchant, metadata}: {campaign_id: u64, merchant: string, metadata: CampaignMetadataInput}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CampaignMetadata>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAATSW52YWxpZEJ1c2luZXNzTmFtZQAAAAADAAAAAAAAABpJbnZhbGlkQnVzaW5lc3NEZXNjcmlwdGlvbgAAAAAABAAAAAAAAAATSW52YWxpZENhbXBhaWduTmFtZQAAAAAFAAAAAAAAABlJbnZhbGlkU2VydmljZURlc2NyaXB0aW9uAAAAAAAABgAAAAAAAAAMSW52YWxpZEltYWdlAAAABwAAAAAAAAAQQ2FtcGFpZ25Ob3RGb3VuZAAAAAgAAAAAAAAADFVuYXV0aG9yaXplZAAAAAkAAAAAAAAAEE1ldGFkYXRhQ29uZmxpY3QAAAAKAAAAAAAAAA9JbnZhbGlkUGFnZVNpemUAAAAACwAAAAAAAAAIT3ZlcmZsb3cAAAAM",
        "AAAAAgAAAAAAAAAAAAAADkNhbXBhaWduU3RhdHVzAAAAAAAFAAAAAAAAAAAAAAAFRHJhZnQAAAAAAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAAHRXhwaXJlZAAAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=",
        "AAAAAQAAAAAAAAAAAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAADAAAAAAAAAAxtZXJjaGFudF9icHMAAAAEAAAAAAAAABBwbGF0Zm9ybV9mZWVfYnBzAAAABAAAAAAAAAALcmVzZXJ2ZV9icHMAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADlJlZ2lzdHJ5Q29uZmlnAAAAAAABAAAAAAAAABFjYW1wYWlnbl9jb250cmFjdAAAAAAAABM=",
        "AAAAAQAAAAAAAAAAAAAAD01lcmNoYW50UHJvZmlsZQAAAAAHAAAAAAAAAA1idXNpbmVzc19uYW1lAAAAAAAAEAAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAALbG9nb19zaGEyNTYAAAAD6AAAA+4AAAAgAAAAAAAAAAhsb2dvX3VybAAAA+gAAAAQAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAACnVwZGF0ZWRfYXQAAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAAEENhbXBhaWduTWV0YWRhdGEAAAAHAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAAxpbWFnZV9zaGEyNTYAAAPoAAAD7gAAACAAAAAAAAAACWltYWdlX3VybAAAAAAAA+gAAAAQAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAABNzZXJ2aWNlX2Rlc2NyaXB0aW9uAAAAABA=",
        "AAAAAQAAAAAAAAAAAAAAEENhbXBhaWduU25hcHNob3QAAAATAAAAAAAAABJjYW5jZWxsYXRpb25fZnVuZHMAAAAAAAsAAAAAAAAAFmNhbmNlbGxhdGlvbl9zaG9ydGZhbGwAAAAAAAsAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAD2ZpbmFuY2lhbF9ydWxlcwAAAAfQAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAptYXhfc3VwcGx5AAAAAAAEAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAAEW1lcmNoYW50X3JlbGVhc2VkAAAAAAAACwAAAAAAAAAKcGFzc19wcmljZQAAAAAACwAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAACHBsYXRmb3JtAAAAEwAAAAAAAAAScGxhdGZvcm1fZmVlc19wYWlkAAAAAAALAAAAAAAAAA9wcm90ZWN0ZWRfZnVuZHMAAAAACwAAAAAAAAAIcmVkZWVtZWQAAAAEAAAAAAAAAAhyZWZ1bmRlZAAAAAQAAAAAAAAADXNlcnZpY2VfdmFsdWUAAAAAAAALAAAAAAAAAARzb2xkAAAABAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADkNhbXBhaWduU3RhdHVzAAA=",
        "AAAABQAAAAAAAAAAAAAAEk1lcmNoYW50UHJvZmlsZVNldAAAAAAAAQAAABRtZXJjaGFudF9wcm9maWxlX3NldAAAAAIAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAAAAAAACnVwZGF0ZWRfYXQAAAAAAAYAAAAAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAAFE1lcmNoYW50UHJvZmlsZUlucHV0AAAABAAAAAAAAAANYnVzaW5lc3NfbmFtZQAAAAAAABAAAAAAAAAAC2Rlc2NyaXB0aW9uAAAAABAAAAAAAAAAC2xvZ29fc2hhMjU2AAAAA+gAAAPuAAAAIAAAAAAAAAAIbG9nb191cmwAAAPoAAAAEA==",
        "AAAAAQAAAAAAAAAAAAAAFUNhbXBhaWduTWV0YWRhdGFJbnB1dAAAAAAAAAQAAAAAAAAADGltYWdlX3NoYTI1NgAAA+gAAAPuAAAAIAAAAAAAAAAJaW1hZ2VfdXJsAAAAAAAD6AAAABAAAAAAAAAABG5hbWUAAAAQAAAAAAAAABNzZXJ2aWNlX2Rlc2NyaXB0aW9uAAAAABA=",
        "AAAABQAAAAAAAAAAAAAAGkNhbXBhaWduTWV0YWRhdGFSZWdpc3RlcmVkAAAAAAABAAAAHGNhbXBhaWduX21ldGFkYXRhX3JlZ2lzdGVyZWQAAAACAAAAAAAAAAtjYW1wYWlnbl9pZAAAAAAGAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAI=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAA5SZWdpc3RyeUNvbmZpZwAAAAAAAw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAALaW5pdGlhbGl6ZXIAAAAAEwAAAAAAAAARY2FtcGFpZ25fY29udHJhY3QAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAPc3RvcmFnZV92ZXJzaW9uAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAQbWFpbnRhaW5fc3RvcmFnZQAAAAIAAAAAAAAACW1lcmNoYW50cwAAAAAAA+oAAAATAAAAAAAAAAxjYW1wYWlnbl9pZHMAAAPqAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAUZ2V0X21lcmNoYW50X3Byb2ZpbGUAAAABAAAAAAAAAAhtZXJjaGFudAAAABMAAAABAAAD6AAAB9AAAAAPTWVyY2hhbnRQcm9maWxlAA==",
        "AAAAAAAAAAAAAAAUc2V0X21lcmNoYW50X3Byb2ZpbGUAAAACAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAAB3Byb2ZpbGUAAAAH0AAAABRNZXJjaGFudFByb2ZpbGVJbnB1dAAAAAEAAAPpAAAH0AAAAA9NZXJjaGFudFByb2ZpbGUAAAAAAw==",
        "AAAAAAAAAAAAAAAVZ2V0X2NhbXBhaWduX21ldGFkYXRhAAAAAAAAAQAAAAAAAAALY2FtcGFpZ25faWQAAAAABgAAAAEAAAPoAAAH0AAAABBDYW1wYWlnbk1ldGFkYXRh",
        "AAAAAAAAAAAAAAAWZ2V0X21lcmNoYW50X2NhbXBhaWducwAAAAAAAwAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAAAAAAZjdXJzb3IAAAAAAAYAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPpAAAD6gAAB9AAAAAQQ2FtcGFpZ25NZXRhZGF0YQAAAAM=",
        "AAAAAAAAAAAAAAAXbWVyY2hhbnRfY2FtcGFpZ25fY291bnQAAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAacmVnaXN0ZXJfY2FtcGFpZ25fbWV0YWRhdGEAAAAAAAMAAAAAAAAAC2NhbXBhaWduX2lkAAAAAAYAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAIbWV0YWRhdGEAAAfQAAAAFUNhbXBhaWduTWV0YWRhdGFJbnB1dAAAAAAAAAEAAAPpAAAH0AAAABBDYW1wYWlnbk1ldGFkYXRhAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_config: this.txFromJSON<Result<RegistryConfig>>,
        initialize: this.txFromJSON<Result<void>>,
        storage_version: this.txFromJSON<u32>,
        maintain_storage: this.txFromJSON<Result<void>>,
        get_merchant_profile: this.txFromJSON<Option<MerchantProfile>>,
        set_merchant_profile: this.txFromJSON<Result<MerchantProfile>>,
        get_campaign_metadata: this.txFromJSON<Option<CampaignMetadata>>,
        get_merchant_campaigns: this.txFromJSON<Result<Array<CampaignMetadata>>>,
        merchant_campaign_count: this.txFromJSON<u64>,
        register_campaign_metadata: this.txFromJSON<Result<CampaignMetadata>>
  }
}