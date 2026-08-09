import { CustomerWorkspace } from "@/components/customer/customer-workspace";
import { Container } from "@/components/ui/container";
import { getStellarConfig } from "@/lib/stellar/config";

export default function PassesPage() {
  return (
    <main id="main-content" className="py-10 sm:py-14">
      <Container>
        <CustomerWorkspace config={getStellarConfig()} />
      </Container>
    </main>
  );
}
