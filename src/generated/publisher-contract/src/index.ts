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
  3: {message:"InvalidConfiguration"}
}


export interface CampaignTerms {
  expires_at: u64;
  financial_rules: FinancialRules;
  max_supply: u32;
  pass_price: i128;
  service_value: i128;
}


export interface FinancialRules {
  merchant_bps: u32;
  platform_fee_bps: u32;
  reserve_bps: u32;
}


export interface PublisherConfig {
  campaign_contract: string;
  metadata_contract: string;
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
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<PublisherConfig>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({initializer, campaign_contract, metadata_contract}: {initializer: string, campaign_contract: string, metadata_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_and_publish_campaign transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_and_publish_campaign: ({merchant, terms, metadata}: {merchant: string, terms: CampaignTerms, metadata: CampaignMetadataInput}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAUSW52YWxpZENvbmZpZ3VyYXRpb24AAAAD",
        "AAAAAQAAAAAAAAAAAAAADUNhbXBhaWduVGVybXMAAAAAAAAFAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAAAAAAA9maW5hbmNpYWxfcnVsZXMAAAAH0AAAAA5GaW5hbmNpYWxSdWxlcwAAAAAAAAAAAAptYXhfc3VwcGx5AAAAAAAEAAAAAAAAAApwYXNzX3ByaWNlAAAAAAALAAAAAAAAAA1zZXJ2aWNlX3ZhbHVlAAAAAAAACw==",
        "AAAAAQAAAAAAAAAAAAAADkZpbmFuY2lhbFJ1bGVzAAAAAAADAAAAAAAAAAxtZXJjaGFudF9icHMAAAAEAAAAAAAAABBwbGF0Zm9ybV9mZWVfYnBzAAAABAAAAAAAAAALcmVzZXJ2ZV9icHMAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAD1B1Ymxpc2hlckNvbmZpZwAAAAACAAAAAAAAABFjYW1wYWlnbl9jb250cmFjdAAAAAAAABMAAAAAAAAAEW1ldGFkYXRhX2NvbnRyYWN0AAAAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAFUNhbXBhaWduTWV0YWRhdGFJbnB1dAAAAAAAAAQAAAAAAAAADGltYWdlX3NoYTI1NgAAA+gAAAPuAAAAIAAAAAAAAAAJaW1hZ2VfdXJsAAAAAAAD6AAAABAAAAAAAAAABG5hbWUAAAAQAAAAAAAAABNzZXJ2aWNlX2Rlc2NyaXB0aW9uAAAAABA=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAA9QdWJsaXNoZXJDb25maWcAAAAAAw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAALaW5pdGlhbGl6ZXIAAAAAEwAAAAAAAAARY2FtcGFpZ25fY29udHJhY3QAAAAAAAATAAAAAAAAABFtZXRhZGF0YV9jb250cmFjdAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAbY3JlYXRlX2FuZF9wdWJsaXNoX2NhbXBhaWduAAAAAAMAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAFdGVybXMAAAAAAAfQAAAADUNhbXBhaWduVGVybXMAAAAAAAAAAAAACG1ldGFkYXRhAAAH0AAAABVDYW1wYWlnbk1ldGFkYXRhSW5wdXQAAAAAAAABAAAD6QAAAAYAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_config: this.txFromJSON<Result<PublisherConfig>>,
        initialize: this.txFromJSON<Result<void>>,
        create_and_publish_campaign: this.txFromJSON<Result<u64>>
  }
}