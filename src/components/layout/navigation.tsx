"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/layout/logo";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useWallet } from "@/components/wallet/wallet-provider";

const navItems = [
  { href: "/merchant", label: "Merchant dashboard" },
  { href: "/passes", label: "My passes" },
];

export function Navigation() {
  const { status } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const walletConnected = status === "connected";

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur-lg">
      <Container className="flex h-18 min-w-0 items-center justify-between gap-4">
        <Link href="/" aria-label="WrenPass home">
          <Logo />
        </Link>

        {walletConnected && (
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="hidden md:block">
          <WalletButton />
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-ink transition hover:bg-sage-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest md:hidden"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      </Container>

      {menuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="border-t border-line bg-canvas px-5 pb-5 pt-3 md:hidden"
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              {walletConnected && navItems.map((item) => (
                <Link
                  key={item.href}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-ink-muted hover:bg-sage-soft hover:text-ink"
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <WalletButton className="mt-2" />
            </div>
          </nav>
      )}
    </header>
  );
}
