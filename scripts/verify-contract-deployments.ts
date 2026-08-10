import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const deploymentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  network: z.enum(["testnet", "mainnet"]),
  networkPassphrase: z.string().min(1),
  rpcUrl: z.string().url(),
  toolchain: z.object({
    stellarCli: z.string().regex(/^\d+\.\d+\.\d+$/),
    rust: z.string().regex(/^\d+\.\d+\.\d+$/),
    rustHost: z.string().regex(/^[a-z0-9_-]+$/),
    sorobanSdk: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  contracts: z.array(
    z.object({
      name: z.string().min(1),
      package: z.string().regex(/^[a-z0-9-]+$/),
      sourcePath: z.string().regex(/^contracts\/[a-z0-9-]+$/),
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      artifact: z.string().regex(/^[a-z0-9_]+\.wasm$/),
      optimized: z.boolean(),
      contractId: z.string().refine(StrKey.isValidContract, "invalid contract ID"),
      wasmSha256: hashSchema,
      deploymentTransactionHash: hashSchema.nullable(),
      explorerUrl: z.string().url(),
    }),
  ).min(1),
  interactionEvidence: z.array(
    z.object({
      label: z.string().min(1),
      transactionHash: hashSchema,
      explorerUrl: z.string().url(),
    }),
  ),
  notes: z.array(z.string().min(1)),
});

type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;
type ContractDeployment = DeploymentManifest["contracts"][number];

const repositoryRoot = resolve(import.meta.dirname, "..");
const stellarCommand = process.platform === "win32" ? "stellar.exe" : "stellar";
const tarCommand = process.platform === "win32" ? "tar.exe" : "tar";

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean } = {},
): string {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      encoding: "utf8",
      env: options.env ?? process.env,
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      const stderr = String(error.stderr ?? "").trim();
      if (stderr) console.error(stderr);
    }
    throw error;
  }
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function assertToolchain(manifest: DeploymentManifest): void {
  const stellarVersion = run(stellarCommand, ["version", "--only-version"], { quiet: true });
  const rustVersion = run("rustc", ["--version"], { quiet: true }).split(" ")[1];
  const rustHost = run("rustc", ["-vV"], { quiet: true })
    .split("\n")
    .find((line) => line.startsWith("host: "))
    ?.slice("host: ".length);

  if (stellarVersion !== manifest.toolchain.stellarCli) {
    throw new Error(
      `Stellar CLI ${manifest.toolchain.stellarCli} is required; found ${stellarVersion}.`,
    );
  }
  if (rustVersion !== manifest.toolchain.rust) {
    throw new Error(`Rust ${manifest.toolchain.rust} is required; found ${rustVersion}.`);
  }
  if (rustHost !== manifest.toolchain.rustHost) {
    throw new Error(
      `Rust host ${manifest.toolchain.rustHost} is required for byte-for-byte provenance; found ${rustHost ?? "unknown"}.`,
    );
  }
}

function assertSourceExists(contract: ContractDeployment): void {
  run("git", ["cat-file", "-e", `${contract.sourceCommit}^{commit}`], { quiet: true });
  run("git", ["cat-file", "-e", `${contract.sourceCommit}:${contract.sourcePath}/src/lib.rs`], {
    quiet: true,
  });
}

function rebuildArtifact(
  contract: ContractDeployment,
  temporaryRoot: string,
  cargoTargetDirectory: string,
): string {
  const snapshotDirectory = join(temporaryRoot, contract.package);
  const archivePath = join(temporaryRoot, `${contract.package}.tar`);
  const outputDirectory = join(snapshotDirectory, "wasm");
  mkdirSync(snapshotDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });

  run("git", [
    "archive",
    "--format=tar",
    `--output=${archivePath}`,
    contract.sourceCommit,
    "contracts",
  ]);
  run(tarCommand, ["-xf", archivePath, "-C", snapshotDirectory]);

  const optimizeArgument = `--optimize=${contract.optimized ? "true" : "false"}`;
  run(
    stellarCommand,
    [
      "contract",
      "build",
      "--manifest-path",
      join(snapshotDirectory, "contracts", "Cargo.toml"),
      "--package",
      contract.package,
      "--out-dir",
      outputDirectory,
      "--locked",
      optimizeArgument,
    ],
    {
      env: {
        ...process.env,
        CARGO_TARGET_DIR: cargoTargetDirectory,
      },
      quiet: true,
    },
  );

  const artifactPath = join(outputDirectory, contract.artifact);
  const artifactHash = sha256(artifactPath);
  if (artifactHash !== contract.wasmSha256) {
    throw new Error(
      `${contract.name} rebuilt to ${artifactHash}, expected ${contract.wasmSha256}.`,
    );
  }
  return artifactHash;
}

function readDeployedHash(
  contract: ContractDeployment,
  manifest: DeploymentManifest,
): string {
  const output = run(
    stellarCommand,
    [
      "contract",
      "info",
      "hash",
      "--contract-id",
      contract.contractId,
      "--rpc-url",
      manifest.rpcUrl,
      "--network-passphrase",
      manifest.networkPassphrase,
    ],
    { quiet: true },
  );
  const deployedHash = output.match(/[a-f0-9]{64}/)?.[0];
  if (!deployedHash) {
    throw new Error(`Unable to read the deployed WASM hash for ${contract.name}.`);
  }
  if (deployedHash !== contract.wasmSha256) {
    throw new Error(
      `${contract.name} is deployed with ${deployedHash}, expected ${contract.wasmSha256}.`,
    );
  }
  return deployedHash;
}

function loadManifest(manifestPath: string): DeploymentManifest {
  const absolutePath = isAbsolute(manifestPath)
    ? manifestPath
    : resolve(repositoryRoot, manifestPath);
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
  return deploymentManifestSchema.parse(parsed);
}

function main(): void {
  const manifestArgument = process.argv[2];
  if (!manifestArgument || manifestArgument.startsWith("--")) {
    throw new Error(
      "Usage: verify-contract-deployments.ts <manifest.json> [--skip-build] [--skip-network]",
    );
  }

  const skipBuild = process.argv.includes("--skip-build");
  const skipNetwork = process.argv.includes("--skip-network");
  const manifest = loadManifest(manifestArgument);
  assertToolchain(manifest);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "wrenpass-provenance-"));
  const cargoTargetDirectory = join(temporaryRoot, "cargo-target");

  try {
    for (const contract of manifest.contracts) {
      assertSourceExists(contract);
      const rebuiltHash = skipBuild
        ? "skipped"
        : rebuildArtifact(contract, temporaryRoot, cargoTargetDirectory);
      const deployedHash = skipNetwork
        ? "skipped"
        : readDeployedHash(contract, manifest);
      console.log(
        `${contract.name}: source ${contract.sourceCommit.slice(0, 8)}, rebuilt ${rebuiltHash}, deployed ${deployedHash}`,
      );
    }
  } finally {
    if (dirname(resolve(temporaryRoot)) !== resolve(tmpdir())) {
      throw new Error("Refusing to remove an unexpected provenance workspace.");
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log(
    `Verified ${manifest.contracts.length} ${manifest.network} contract deployments and ${manifest.interactionEvidence.length} interaction evidence records.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Contract deployment verification failed.");
  process.exitCode = 1;
}
