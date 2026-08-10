import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const deploymentInputSchema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  release: z.string().trim().regex(/^[a-zA-Z0-9._-]{1,64}$/),
  deployerIdentity: z.string().trim().min(1),
  platformAddress: z.string().refine(StrKey.isValidEd25519PublicKey),
  paymentAssetContractId: z.string().refine(StrKey.isValidContract),
});

const contractDefinitions = [
  {
    name: "campaign",
    package: "wrenpass-campaign",
    artifact: "wrenpass_campaign.wasm",
  },
  {
    name: "metadata",
    package: "wrenpass-metadata",
    artifact: "wrenpass_metadata.wasm",
  },
  {
    name: "redemptions",
    package: "wrenpass-redemptions",
    artifact: "wrenpass_redemptions.wasm",
  },
  {
    name: "reviews",
    package: "wrenpass-reviews",
    artifact: "wrenpass_reviews.wasm",
  },
] as const;

const repositoryRoot = resolve(import.meta.dirname, "..");
const stellarCommand = process.platform === "win32" ? "stellar.exe" : "stellar";

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

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function releaseSalt(
  network: "testnet" | "mainnet",
  release: string,
  packageName: string,
  wasmSha256: string,
): string {
  return createHash("sha256")
    .update(`wrenpass:${network}:${release}:${packageName}:${wasmSha256}`)
    .digest("hex");
}

function initializeContract(
  name: (typeof contractDefinitions)[number]["name"],
  contractId: string,
  campaignContractId: string,
  input: z.infer<typeof deploymentInputSchema>,
): void {
  if (name === "reviews") return;

  try {
    const existingConfig = JSON.parse(
      run(
        [
          "contract",
          "invoke",
          "--id",
          contractId,
          "--source-account",
          input.platformAddress,
          "--network",
          input.network,
          "--send=no",
          "--",
          "get_config",
        ],
        true,
      ),
    ) as Record<string, unknown>;
    if (name === "campaign") {
      if (
        existingConfig.platform !== input.platformAddress ||
        existingConfig.payment_asset !== input.paymentAssetContractId
      ) {
        throw new Error("The existing campaign contract configuration does not match this release.");
      }
    } else if (existingConfig.campaign_contract !== campaignContractId) {
      throw new Error(`The existing ${name} contract targets a different campaign contract.`);
    }
    return;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The existing")) throw error;
  }

  const invokeArguments = [
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
  ];

  if (name === "campaign") {
    invokeArguments.push(
      "--platform",
      input.platformAddress,
      "--payment_asset",
      input.paymentAssetContractId,
    );
  } else {
    invokeArguments.push(
      "--initializer",
      input.platformAddress,
      "--campaign_contract",
      campaignContractId,
    );
  }

  run(invokeArguments);
}

function main(): void {
  const network = argumentValue("--network");
  const input = deploymentInputSchema.parse({
    network,
    release: process.env.WRENPASS_RELEASE,
    deployerIdentity: process.env.STELLAR_DEPLOYER_IDENTITY,
    platformAddress: process.env.STELLAR_PLATFORM_ADDRESS,
    paymentAssetContractId: process.env.STELLAR_PAYMENT_ASSET_CONTRACT_ID,
  });
  const dryRun = process.argv.includes("--dry-run");
  const networkPassphrase = input.network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
  const deployerAddress = StrKey.isValidEd25519PublicKey(input.deployerIdentity)
    ? input.deployerIdentity
    : run(["keys", "public-key", input.deployerIdentity], true);

  if (deployerAddress !== input.platformAddress) {
    throw new Error("STELLAR_DEPLOYER_IDENTITY must resolve to STELLAR_PLATFORM_ADDRESS.");
  }
  if (!dryRun && StrKey.isValidEd25519PublicKey(input.deployerIdentity)) {
    throw new Error(
      "A public address cannot sign deployments. Use a Stellar CLI identity backed by secure storage.",
    );
  }

  const deployments = contractDefinitions.map((definition) => {
    const artifactPath = resolve(repositoryRoot, "contracts", "wasm", definition.artifact);
    const wasmSha256 = sha256File(artifactPath);
    const salt = releaseSalt(input.network, input.release, definition.package, wasmSha256);
    const contractId = run([
      "contract",
      "id",
      "wasm",
      "--salt",
      salt,
      "--source-account",
      input.platformAddress,
      "--network",
      input.network,
    ]);

    if (!StrKey.isValidContract(contractId)) {
      throw new Error(`Stellar CLI returned an invalid contract ID for ${definition.name}.`);
    }

    return { ...definition, artifactPath, wasmSha256, salt, contractId };
  });

  if (!dryRun) {
    for (const deployment of deployments) {
      let existingHash: string | null = null;
      try {
        existingHash = run(
          [
            "contract",
            "info",
            "hash",
            "--contract-id",
            deployment.contractId,
            "--network",
            input.network,
          ],
          true,
        ).match(/[a-f0-9]{64}/)?.[0] ?? null;
      } catch {
        existingHash = null;
      }

      if (existingHash && existingHash !== deployment.wasmSha256) {
        throw new Error(
          `${deployment.name} already exists with ${existingHash}, expected ${deployment.wasmSha256}.`,
        );
      }
      if (!existingHash) {
        const deployedId = run([
          "contract",
          "deploy",
          "--wasm",
          deployment.artifactPath,
          "--salt",
          deployment.salt,
          "--source-account",
          input.deployerIdentity,
          "--network",
          input.network,
          "--optimize=false",
        ]);
        if (deployedId !== deployment.contractId) {
          throw new Error(
            `${deployment.name} deployed as ${deployedId}, expected ${deployment.contractId}.`,
          );
        }
      }
    }

    const campaignContractId = deployments[0].contractId;
    for (const deployment of deployments) {
      initializeContract(
        deployment.name,
        deployment.contractId,
        campaignContractId,
        input,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        network: input.network,
        networkPassphrase,
        release: input.release,
        deployer: input.platformAddress,
        contracts: deployments.map(
          ({ name, package: packageName, artifact, wasmSha256, salt, contractId }) => ({
            name,
            package: packageName,
            artifact,
            wasmSha256,
            salt,
            contractId,
          }),
        ),
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Contract suite deployment failed.");
  process.exitCode = 1;
}
