import { MerchantWorkspace, type MerchantWorkspacePage } from "@/components/merchant/merchant-workspace";
import { Container } from "@/components/ui/container";
import { WalletRouteGuard } from "@/components/wallet/wallet-route-guard";
import { getStellarConfig } from "@/lib/stellar/config";

export function MerchantPageShell({ page }: { page: MerchantWorkspacePage }) {
  return (
    <main id="main-content" className="min-h-[calc(100svh-4.5rem)] bg-workspace py-7 sm:py-9">
      <Container className="max-w-[94rem]">
        <WalletRouteGuard>
          <MerchantWorkspace config={getStellarConfig()} page={page} />
        </WalletRouteGuard>
      </Container>
    </main>
  );
}
