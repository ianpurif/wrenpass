import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { CustomerService } from "@/server/customer/customer-service";
import { getMerchantService } from "@/server/merchant/service";
import { StellarCustomerChainReader } from "@/server/stellar/customer-chain-reader";

let customerService: CustomerService | undefined;
const passRequests = new Map<string, Promise<Awaited<ReturnType<CustomerService["getPasses"]>>>>();
const activityRequests = new Map<string, Promise<Awaited<ReturnType<CustomerService["getActivity"]>>>>();

export function getCustomerService(): CustomerService {
  customerService ??= new CustomerService(
    new StellarCustomerChainReader(getStellarConfig()),
    getMerchantService(),
  );
  return customerService;
}

export function getCustomerPasses(walletAddress: string) {
  const existing = passRequests.get(walletAddress);
  if (existing) return existing;

  const request = getCustomerService().getPasses(walletAddress).finally(() => {
    if (passRequests.get(walletAddress) === request) {
      passRequests.delete(walletAddress);
    }
  });
  passRequests.set(walletAddress, request);
  return request;
}

export function getCustomerActivity(walletAddress: string) {
  const existing = activityRequests.get(walletAddress);
  if (existing) return existing;

  const request = getCustomerService().getActivity(walletAddress).finally(() => {
    if (activityRequests.get(walletAddress) === request) {
      activityRequests.delete(walletAddress);
    }
  });
  activityRequests.set(walletAddress, request);
  return request;
}

export async function getCustomerDashboard(walletAddress: string) {
  const [passes, activityWindow] = await Promise.all([
    getCustomerPasses(walletAddress),
    getCustomerActivity(walletAddress),
  ]);
  return { passes, ...activityWindow };
}
