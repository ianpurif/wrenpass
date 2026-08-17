import "server-only";

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  rpc,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";

import { formatUsdcAmount, parseUsdcAmount } from "@/features/merchant/campaign-terms";
import type { StellarConfig } from "@/lib/stellar/config";
import {
  StellarCustomerContractWriter,
  type PurchaseReceipt,
} from "@/lib/stellar/wrenpass-client";
import { connectSimulatorWallet } from "@/server/simulator/simulator-wallet-session";
import {
  createTestnetCustomerWalletVault,
  type TestnetCustomerWalletVault,
} from "@/server/simulator/testnet-customer-wallet-vault";
import { getWalletAuthService } from "@/server/wallet-auth/service";

const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
const SLIPPAGE_BPS = 500n;
const BASIS_POINTS = 10_000n;
const MAX_XLM_SWAP = parseUsdcAmount("100");

interface PathAssetRecord {
  asset_type: string;
  asset_code: string;
  asset_issuer: string;
}

interface SwapQuote {
  path: Asset[];
  sourceAmount: bigint;
}

export interface TestnetSimulationExecutionResult {
  walletAddress: string;
  campaignId: string;
  fundingAmount: string;
  xlmSwapMaximum: string;
  swapTransactionHash: string;
  walletSessionExpiresAt: string;
  purchases: Array<{
    passId: string;
    transactionHash: string;
    ledger: number;
  }>;
}

export interface TestnetSimulationExecutor {
  execute(input: {
    campaignId: bigint;
    fundingAmount: bigint;
    purchaseCount: number;
    origin: string;
  }): Promise<TestnetSimulationExecutionResult>;
}

function pathAsset(record: PathAssetRecord): Asset {
  return record.asset_type === "native"
    ? Asset.native()
    : new Asset(record.asset_code, record.asset_issuer);
}

export function calculateSwapSendMaximum(sourceAmount: bigint): bigint {
  return (sourceAmount * (BASIS_POINTS + SLIPPAGE_BPS) + BASIS_POINTS - 1n)
    / BASIS_POINTS;
}

function transactionResultCode(response: rpc.Api.SendTransactionResponse): string {
  return response.errorResult?.result().switch().name ?? response.status;
}

async function submitSameTransaction(
  server: rpc.Server,
  transaction: Transaction,
): Promise<{ hash: string; ledger: number }> {
  let sent: rpc.Api.SendTransactionResponse;
  try {
    sent = await server.sendTransaction(transaction);
  } catch {
    // Resubmitting the same signed XDR is idempotent and cannot create a second swap.
    sent = await server.sendTransaction(transaction);
  }
  if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
    throw new Error(`Stellar rejected the simulator swap: ${transactionResultCode(sent)}.`);
  }
  const result = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(
      result.status === rpc.Api.GetTransactionStatus.NOT_FOUND
        ? "The simulator swap was not confirmed before its timeout."
        : "Stellar rejected the simulator swap.",
    );
  }
  return { hash: sent.hash, ledger: result.ledger };
}

export class StellarTestnetSimulationExecutor implements TestnetSimulationExecutor {
  private readonly rpc: rpc.Server;
  private readonly horizon: Horizon.Server;
  private readonly writer: StellarCustomerContractWriter;
  private readonly paymentAsset: Asset;
  private readonly customerWalletVault: TestnetCustomerWalletVault;

  constructor(
    private readonly config: StellarConfig,
    customerWalletVault?: TestnetCustomerWalletVault,
  ) {
    if (config.network !== "testnet") {
      throw new Error("The automated purchase simulator is restricted to Stellar Testnet.");
    }
    this.customerWalletVault = customerWalletVault ?? createTestnetCustomerWalletVault();
    this.rpc = new rpc.Server(config.rpcUrl);
    this.horizon = new Horizon.Server(HORIZON_TESTNET_URL);
    this.writer = new StellarCustomerContractWriter(config);
    this.paymentAsset = new Asset(config.assetCode, config.assetIssuer);
  }

  private async fundWithFriendbot(buyer: Keypair): Promise<void> {
    try {
      await this.rpc.fundAddress(buyer.publicKey());
    } catch (error) {
      try {
        await this.rpc.getAccount(buyer.publicKey());
      } catch {
        throw error;
      }
    }
  }

  private async quoteSwap(destinationAmount: bigint): Promise<SwapQuote> {
    const response = await this.horizon
      .strictReceivePaths(
        [Asset.native()],
        this.paymentAsset,
        formatUsdcAmount(destinationAmount),
      )
      .call();
    const candidates = response.records
      .filter((record) => record.source_asset_type === "native")
      .map((record) => ({
        path: record.path.map(pathAsset),
        sourceAmount: parseUsdcAmount(record.source_amount),
      }))
      .sort((left, right) => left.sourceAmount < right.sourceAmount ? -1 : 1);
    const quote = candidates[0];
    if (!quote) {
      throw new Error(
        `No Testnet XLM to ${this.config.assetCode} liquidity path is currently available.`,
      );
    }
    return quote;
  }

  private async establishTrustlineAndSwap(
    buyer: Keypair,
    destinationAmount: bigint,
  ): Promise<{ hash: string; maximumXlm: bigint }> {
    const quote = await this.quoteSwap(destinationAmount);
    const maximumXlm = calculateSwapSendMaximum(quote.sourceAmount);
    if (maximumXlm > MAX_XLM_SWAP) {
      throw new Error("The available Testnet XLM to USDC quote exceeds the simulator safety limit.");
    }
    const account = await this.rpc.getAccount(buyer.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset: this.paymentAsset }))
      .addOperation(Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: formatUsdcAmount(maximumXlm),
        destination: buyer.publicKey(),
        destAsset: this.paymentAsset,
        destAmount: formatUsdcAmount(destinationAmount),
        path: quote.path,
      }))
      .setTimeout(60)
      .build();
    transaction.sign(buyer);
    const result = await submitSameTransaction(this.rpc, transaction);
    return { hash: result.hash, maximumXlm };
  }

  async execute(input: {
    campaignId: bigint;
    fundingAmount: bigint;
    purchaseCount: number;
    origin: string;
  }): Promise<TestnetSimulationExecutionResult> {
    const buyer = Keypair.random();
    await this.customerWalletVault.persist(buyer);
    await this.fundWithFriendbot(buyer);
    const swap = await this.establishTrustlineAndSwap(buyer, input.fundingAmount);
    const walletSession = await connectSimulatorWallet(
      getWalletAuthService(),
      buyer,
      input.origin,
    );
    const receipts: PurchaseReceipt[] = [];
    for (let index = 0; index < input.purchaseCount; index += 1) {
      receipts.push(await this.writer.purchase({
        campaignId: input.campaignId,
        customer: buyer.publicKey(),
        signTransaction: buyer,
      }));
    }

    return {
      walletAddress: buyer.publicKey(),
      campaignId: input.campaignId.toString(),
      fundingAmount: input.fundingAmount.toString(),
      xlmSwapMaximum: swap.maximumXlm.toString(),
      swapTransactionHash: swap.hash,
      walletSessionExpiresAt: walletSession.expiresAt,
      purchases: receipts.map((receipt) => ({
        passId: receipt.passId.toString(),
        transactionHash: receipt.transactionHash,
        ledger: receipt.ledger,
      })),
    };
  }
}
