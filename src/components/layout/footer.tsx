"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { Container } from "@/components/ui/container";

export function Footer() {
  const pathname = usePathname();
  const isProductWorkspace = pathname === "/passes" || pathname.startsWith("/merchant");

  if (isProductWorkspace) return null;

  return (
    <footer className="border-t border-line bg-white py-8">
      <Container className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
            Future service value, funded by the customers who believe in local businesses.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-muted">
          <Link className="hover:text-ink" href="/#how-it-works">
            How it works
          </Link>
          <Link className="hover:text-ink" href="/#trust">
            Trust & safety
          </Link>
          <span>Built on Stellar</span>
        </div>
      </Container>
    </footer>
  );
}
