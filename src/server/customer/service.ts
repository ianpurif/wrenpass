import "server-only";

import { getStellarConfig } from "@/lib/stellar/config";
import { CustomerService } from "@/server/customer/customer-service";
import { getMerchantService } from "@/server/merchant/service";
import { StellarCustomerChainReader } from "@/server/stellar/customer-chain-reader";

let customerService: CustomerService | undefined;

export function getCustomerService(): CustomerService {
  customerService ??= new CustomerService(
    new StellarCustomerChainReader(getStellarConfig()),
    getMerchantService(),
  );
  return customerService;
}
