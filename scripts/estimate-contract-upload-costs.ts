import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  rpc,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const MAINNET_HORIZON_URL = "https://horizon.stellar.org";
const MAINNET_RPC_URL = "https://mainnet.sorobanrpc.com/";
const CONTRACTS = [
  "wrenpass_campaign",
  "wrenpass_metadata",
  "wrenpass_publisher",
  "wrenpass_redemptions",
  "wrenpass_reviews",
] as const;

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function formatXlm(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${fraction}`;
}

async function findSimulationSource(
  horizon: Horizon.Server,
  requestedAddress?: string,
): Promise<Horizon.AccountResponse> {
  if (requestedAddress) {
    if (!StrKey.isValidEd25519PublicKey(requestedAddress)) {
      throw new Error("--source-account must be a valid Stellar public address.");
    }
    return horizon.loadAccount(requestedAddress);
  }

  const recent = await horizon.transactions().order("desc").limit(20).call();
  for (const transaction of recent.records) {
    try {
      return await horizon.loadAccount(transaction.source_account);
    } catch {
      // A recently used account may have been merged; try the next public account.
    }
  }
  throw new Error("No funded Mainnet account was available for transaction simulation.");
}

async function main(): Promise<void> {
  const wasmDirectory = resolve(argumentValue("--wasm-dir") ?? "contracts/wasm");
  const horizon = new Horizon.Server(MAINNET_HORIZON_URL);
  const source = await findSimulationSource(
    horizon,
    argumentValue("--source-account"),
  );
  const server = new rpc.Server(MAINNET_RPC_URL);
  const contracts = [];
  let totalBytes = 0;
  let totalResourceFee = 0n;

  for (const contract of CONTRACTS) {
    const wasmPath = resolve(wasmDirectory, `${contract}.wasm`);
    const [wasm, file] = await Promise.all([readFile(wasmPath), stat(wasmPath)]);
    const transaction = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(Operation.uploadContractWasm({ wasm }))
      .setTimeout(0)
      .build();
    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(`${contract} upload simulation failed: ${simulation.error}`);
    }

    const resourceFeeStroops = BigInt(simulation.minResourceFee);
    totalBytes += file.size;
    totalResourceFee += resourceFeeStroops;
    contracts.push({
      contract,
      wasmBytes: file.size,
      resourceFeeStroops: resourceFeeStroops.toString(),
      resourceFeeXlm: formatXlm(resourceFeeStroops),
    });
  }

  console.log(JSON.stringify({
    network: "mainnet",
    simulatedAt: new Date().toISOString(),
    wasmDirectory,
    contracts,
    totals: {
      wasmBytes: totalBytes,
      resourceFeeStroops: totalResourceFee.toString(),
      resourceFeeXlm: formatXlm(totalResourceFee),
    },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Upload-cost simulation failed.");
  process.exitCode = 1;
});
