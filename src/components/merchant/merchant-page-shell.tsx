import { MerchantWorkspace, type MerchantWorkspacePage } from "@/components/merchant/merchant-workspace";
import { Container } from "@/components/ui/container";
import { WalletRouteGuard } from "@/components/wallet/wallet-route-guard";
import { getStellarConfig } from "@/lib/stellar/config";

export function MerchantPageShell({ page }: { page: MerchantWorkspacePage }) {
  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <WalletRouteGuard>
          <MerchantWorkspace config={getStellarConfig()} page={page} />
        </WalletRouteGuard>
      </Container>
    </main>
  );
}
