import { MerchantWorkspace, type MerchantWorkspacePage } from "@/components/merchant/merchant-workspace";
import { Container } from "@/components/ui/container";
import { getStellarConfig } from "@/lib/stellar/config";

export function MerchantPageShell({ page }: { page: MerchantWorkspacePage }) {
  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <MerchantWorkspace config={getStellarConfig()} page={page} />
      </Container>
    </main>
  );
}
