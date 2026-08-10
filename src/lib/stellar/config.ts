import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const rpcUrlSchema = z.string().trim().url("RPC URL must be a valid URL").refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  );
}, "RPC URL must use HTTPS unless it targets localhost");

const stellarConfigSchema = z.object({
  NEXT_PUBLIC_STELLAR_NETWORK: z.enum(["testnet", "mainnet"]),
  NEXT_PUBLIC_STELLAR_RPC_URL: rpcUrlSchema,
  NEXT_PUBLIC_STELLAR_ASSET_CODE: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{1,12}$/, "asset code must contain 1 to 12 letters or numbers"),
  NEXT_PUBLIC_STELLAR_ASSET_ISSUER: z
    .string()
    .trim()
    .refine(StrKey.isValidEd25519PublicKey, "asset issuer must be a valid Stellar G-address"),
  NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID: z
    .string()
    .trim()
    .refine(StrKey.isValidContract, "asset contract ID must be a valid Stellar C-address"),
  NEXT_PUBLIC_WRENPASS_CONTRACT_ID: z
    .string()
    .trim()
    .refine(StrKey.isValidContract, "WrenPass contract ID must be a valid Stellar C-address"),
  NEXT_PUBLIC_WRENPASS_REVIEW_CONTRACT_ID: z
    .string()
    .trim()
    .refine(StrKey.isValidContract, "review contract ID must be a valid Stellar C-address"),
  NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID: z
    .string()
    .trim()
    .refine(StrKey.isValidContract, "metadata contract ID must be a valid Stellar C-address"),
});

export type StellarNetwork = "testnet" | "mainnet";

export interface StellarConfig {
  network: StellarNetwork;
  networkPassphrase: string;
  rpcUrl: string;
  assetCode: string;
  assetIssuer: string;
  assetContractId: string;
  wrenPassContractId: string;
  reviewContractId: string;
  metadataContractId: string;
}

type StellarConfigInput = Partial<
  Record<keyof z.input<typeof stellarConfigSchema>, string | undefined>
>;

export function parseStellarConfig(input: StellarConfigInput): StellarConfig {
  const result = stellarConfigSchema.safeParse(input);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid Stellar configuration: ${problems}`);
  }

  const values = result.data;
  const networkPassphrase =
    values.NEXT_PUBLIC_STELLAR_NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
  const expectedContractId = new Asset(
    values.NEXT_PUBLIC_STELLAR_ASSET_CODE,
    values.NEXT_PUBLIC_STELLAR_ASSET_ISSUER,
  ).contractId(networkPassphrase);

  if (expectedContractId !== values.NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID) {
    throw new Error(
      "Invalid Stellar configuration: asset contract ID does not match the configured asset and network",
    );
  }

  return {
    network: values.NEXT_PUBLIC_STELLAR_NETWORK,
    networkPassphrase,
    rpcUrl: values.NEXT_PUBLIC_STELLAR_RPC_URL,
    assetCode: values.NEXT_PUBLIC_STELLAR_ASSET_CODE,
    assetIssuer: values.NEXT_PUBLIC_STELLAR_ASSET_ISSUER,
    assetContractId: values.NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID,
    wrenPassContractId: values.NEXT_PUBLIC_WRENPASS_CONTRACT_ID,
    reviewContractId: values.NEXT_PUBLIC_WRENPASS_REVIEW_CONTRACT_ID,
    metadataContractId: values.NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID,
  };
}

let cachedConfig: StellarConfig | undefined;

export function getStellarConfig(): StellarConfig {
  cachedConfig ??= parseStellarConfig({
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_STELLAR_RPC_URL: process.env.NEXT_PUBLIC_STELLAR_RPC_URL,
    NEXT_PUBLIC_STELLAR_ASSET_CODE: process.env.NEXT_PUBLIC_STELLAR_ASSET_CODE,
    NEXT_PUBLIC_STELLAR_ASSET_ISSUER: process.env.NEXT_PUBLIC_STELLAR_ASSET_ISSUER,
    NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID:
      process.env.NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID,
    NEXT_PUBLIC_WRENPASS_CONTRACT_ID: process.env.NEXT_PUBLIC_WRENPASS_CONTRACT_ID,
    NEXT_PUBLIC_WRENPASS_REVIEW_CONTRACT_ID:
      process.env.NEXT_PUBLIC_WRENPASS_REVIEW_CONTRACT_ID,
    NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID:
      process.env.NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID,
  });

  return cachedConfig;
}
