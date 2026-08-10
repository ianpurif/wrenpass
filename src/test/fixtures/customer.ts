import type { CustomerPassDto } from "@/features/customer/dto";
import type { PublicCampaignDto } from "@/features/merchant/dto";
import type { StellarConfig } from "@/lib/stellar/config";

export const testCustomerAddress = "GADRDDWDRMVMA3UBOSZAA5NYPO6RPH6NRYMA5SCGDE33E7NC46P7KGDO";
export const testRecipientAddress = "GDWG624PKCPECMA2AKLTF4ETJVB64MVIKDBPVL5J4I54TH5U4MCZMY2H";

export const testStellarConfig: StellarConfig = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  assetCode: "USDC",
  assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  assetContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  wrenPassContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
  reviewContractId: "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D",
};

export const testPublicCampaign: PublicCampaignDto = {
  metadata: {
    id: "1",
    contractId: testStellarConfig.wrenPassContractId,
    merchantId: testCustomerAddress,
    name: "Future haircut",
    serviceDescription: "One complete haircut service at the merchant location.",
    createdAt: "2026-08-09T07:31:02.000Z",
    updatedAt: "2026-08-09T07:31:02.000Z",
  },
  merchant: {
    id: testCustomerAddress,
    ownerWalletAddress: testCustomerAddress,
    businessName: "Wren Studio",
    description: "A neighborhood studio providing complete haircut services.",
    createdAt: "2026-08-09T07:30:00.000Z",
    updatedAt: "2026-08-09T07:30:00.000Z",
  },
  onchain: {
    id: "1",
    merchant: testCustomerAddress,
    passPrice: "50000000",
    serviceValue: "60000000",
    maxSupply: 100,
    sold: 0,
    remaining: 100,
    redeemed: 0,
    refunded: 0,
    merchantReleased: "0",
    protectedFunds: "0",
    platformFeesPaid: "0",
    expiresAt: "1794121200",
    financialRules: { merchantBps: 7_500, reserveBps: 2_000, platformFeeBps: 500 },
    status: "Active",
  },
};

export const testCustomerPass: CustomerPassDto = {
  id: "1",
  campaignId: "1",
  owner: testCustomerAddress,
  status: "Active",
  purchasedAt: "1786261200",
  purchaseAmounts: {
    total: "50000000",
    merchantRelease: "37500000",
    protectedReserve: "10000000",
    platformFee: "2500000",
  },
  campaign: testPublicCampaign,
};
