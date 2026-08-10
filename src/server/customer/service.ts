import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { CustomerService } from "@/server/customer/customer-service";
import { getMerchantService } from "@/server/merchant/service";
import { StellarCustomerChainReader } from "@/server/stellar/customer-chain-reader";

let customerService: CustomerService | undefined;
const dashboardRequests = new Map<string, Promise<Awaited<ReturnType<CustomerService["getDashboard"]>>>>();

export function getCustomerService(): CustomerService {
  customerService ??= new CustomerService(
    new StellarCustomerChainReader(getStellarConfig()),
    getMerchantService(),
  );
  return customerService;
}

export function getCustomerDashboard(walletAddress: string) {
  const existing = dashboardRequests.get(walletAddress);
  if (existing) return existing;

  const request = getCustomerService().getDashboard(walletAddress).finally(() => {
    if (dashboardRequests.get(walletAddress) === request) {
      dashboardRequests.delete(walletAddress);
    }
  });
  dashboardRequests.set(walletAddress, request);
  return request;
}
