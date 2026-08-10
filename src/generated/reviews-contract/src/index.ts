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
  1: {message:"InvalidRating"},
  2: {message:"InvalidMessage"},
  3: {message:"InvalidPageSize"},
  4: {message:"Overflow"}
}


export interface Review {
  created_at: u64;
  id: u64;
  message: string;
  rating: u32;
  reviewer: string;
}


export interface Client {
  /**
   * Construct and simulate a get_review transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_review: ({review_id}: {review_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Review>>>

  /**
   * Construct and simulate a get_reviews transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reviews: ({before_id, limit}: {before_id: Option<u64>, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<Review>>>>

  /**
   * Construct and simulate a review_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  review_count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a submit_review transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit_review: ({reviewer, rating, message}: {reviewer: string, rating: u32, message: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAANSW52YWxpZFJhdGluZwAAAAAAAAEAAAAAAAAADkludmFsaWRNZXNzYWdlAAAAAAACAAAAAAAAAA9JbnZhbGlkUGFnZVNpemUAAAAAAwAAAAAAAAAIT3ZlcmZsb3cAAAAE",
        "AAAAAQAAAAAAAAAAAAAABlJldmlldwAAAAAABQAAAAAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAACaWQAAAAAAAYAAAAAAAAAB21lc3NhZ2UAAAAAEAAAAAAAAAAGcmF0aW5nAAAAAAAEAAAAAAAAAAhyZXZpZXdlcgAAABM=",
        "AAAABQAAAAAAAAAAAAAAD1Jldmlld1N1Ym1pdHRlZAAAAAABAAAAEHJldmlld19zdWJtaXR0ZWQAAAAEAAAAAAAAAAlyZXZpZXdfaWQAAAAAAAAGAAAAAQAAAAAAAAAIcmV2aWV3ZXIAAAATAAAAAQAAAAAAAAAGcmF0aW5nAAAAAAAEAAAAAAAAAAAAAAAHbWVzc2FnZQAAAAAQAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAKZ2V0X3JldmlldwAAAAAAAQAAAAAAAAAJcmV2aWV3X2lkAAAAAAAABgAAAAEAAAPoAAAH0AAAAAZSZXZpZXcAAA==",
        "AAAAAAAAAAAAAAALZ2V0X3Jldmlld3MAAAAAAgAAAAAAAAAJYmVmb3JlX2lkAAAAAAAD6AAAAAYAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPpAAAD6gAAB9AAAAAGUmV2aWV3AAAAAAAD",
        "AAAAAAAAAAAAAAAMcmV2aWV3X2NvdW50AAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAANc3VibWl0X3JldmlldwAAAAAAAAMAAAAAAAAACHJldmlld2VyAAAAEwAAAAAAAAAGcmF0aW5nAAAAAAAEAAAAAAAAAAdtZXNzYWdlAAAAABAAAAABAAAD6QAAAAYAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_review: this.txFromJSON<Option<Review>>,
        get_reviews: this.txFromJSON<Result<Array<Review>>>,
        review_count: this.txFromJSON<u64>,
        submit_review: this.txFromJSON<Result<u64>>
  }
}