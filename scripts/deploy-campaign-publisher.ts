import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const inputSchema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  deployerIdentity: z.string().trim().min(1),
  initializer: z.string().refine(StrKey.isValidEd25519PublicKey),
  campaignContractId: z.string().refine(StrKey.isValidContract),
  metadataContractId: z.string().refine(StrKey.isValidContract),
});

const repositoryRoot = resolve(import.meta.dirname, "..");
const stellarCommand = process.platform === "win32" ? "stellar.exe" : "stellar";
const artifactPath = resolve(repositoryRoot, "contracts", "wasm", "wrenpass_publisher.wasm");

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(args: string[], quietStderr = false): string {
  return execFileSync(stellarCommand, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quietStderr ? "pipe" : "inherit"],
    windowsHide: true,
  }).trim();
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const input = inputSchema.parse({
    network: argumentValue("--network") ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    deployerIdentity:
      argumentValue("--source-account") ?? process.env.STELLAR_DEPLOYER_IDENTITY,
    initializer: argumentValue("--initializer") ?? process.env.STELLAR_PLATFORM_ADDRESS,
    campaignContractId: process.env.NEXT_PUBLIC_WRENPASS_CONTRACT_ID,
    metadataContractId: process.env.NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID,
  });
  const wasmSha256 = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
  const salt = createHash("sha256")
    .update(
      `wrenpass-publisher:${input.network}:${input.campaignContractId}:${input.metadataContractId}:${wasmSha256}`,
    )
    .digest("hex");
  const contractId = run([
    "contract",
    "id",
    "wasm",
    "--salt",
    salt,
    "--source-account",
    input.initializer,
    "--network",
    input.network,
  ]);

  let existingHash: string | null = null;
  try {
    existingHash = run([
      "contract",
      "info",
      "hash",
      "--contract-id",
      contractId,
      "--network",
      input.network,
    ], true).match(/[a-f0-9]{64}/)?.[0] ?? null;
  } catch {
    existingHash = null;
  }

  if (existingHash && existingHash !== wasmSha256) {
    throw new Error(`Publisher ${contractId} exists with an unexpected WASM hash.`);
  }
  if (!existingHash) {
    const deployedId = run([
      "contract",
      "deploy",
      "--wasm",
      artifactPath,
      "--salt",
      salt,
      "--source-account",
      input.deployerIdentity,
      "--network",
      input.network,
      // The build step already optimized this artifact; preserve the hash used for the ID.
      "--optimize=false",
    ]);
    if (deployedId !== contractId) {
      throw new Error(`Publisher deployed as ${deployedId}, expected ${contractId}.`);
    }
  }

  let config: { campaign_contract: string; metadata_contract: string } | null = null;
  try {
    config = JSON.parse(run([
      "contract",
      "invoke",
      "--id",
      contractId,
      "--source-account",
      input.initializer,
      "--network",
      input.network,
      "--send=no",
      "--",
      "get_config",
    ], true)) as typeof config;
  } catch {
    config = null;
  }

  if (!config) {
    for (const retryDelay of [1_000, 2_000, 4_000, 0]) {
      try {
        run([
          "contract",
          "invoke",
          "--id",
          contractId,
          "--source-account",
          input.deployerIdentity,
          "--network",
          input.network,
          "--send=yes",
          "--",
          "initialize",
          "--initializer",
          input.initializer,
          "--campaign_contract",
          input.campaignContractId,
          "--metadata_contract",
          input.metadataContractId,
        ]);
        config = {
          campaign_contract: input.campaignContractId,
          metadata_contract: input.metadataContractId,
        };
      } catch (error) {
        try {
          config = JSON.parse(run([
            "contract",
            "invoke",
            "--id",
            contractId,
            "--source-account",
            input.initializer,
            "--network",
            input.network,
            "--send=no",
            "--",
            "get_config",
          ], true)) as typeof config;
        } catch {
          config = null;
        }
        if (!config && retryDelay === 0) throw error;
      }
      if (config) break;
      if (retryDelay > 0) await wait(retryDelay);
    }
    config ??= {
      campaign_contract: input.campaignContractId,
      metadata_contract: input.metadataContractId,
    };
  }

  if (
    config.campaign_contract !== input.campaignContractId
    || config.metadata_contract !== input.metadataContractId
  ) {
    throw new Error("The deployed publisher targets unexpected contracts.");
  }

  console.log(JSON.stringify({
    network: input.network,
    networkPassphrase: input.network === "testnet" ? Networks.TESTNET : Networks.PUBLIC,
    contractId,
    campaignContractId: input.campaignContractId,
    metadataContractId: input.metadataContractId,
    wasmSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Publisher deployment failed.");
  process.exitCode = 1;
});
