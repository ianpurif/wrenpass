"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/layout/logo";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { WalletBalanceStrip } from "@/components/wallet/wallet-balance-strip";
import { WalletButton } from "@/components/wallet/wallet-button";

const navItems = [
  { href: "/merchant", label: "Merchant dashboard" },
  { href: "/passes", label: "My passes" },
];

export function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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
      <Container className="flex min-w-0 h-18 items-center justify-between gap-4">
        <Link href="/" aria-label="WrenPass home">
          <Logo />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
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

        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <WalletBalanceStrip />
          <WalletButton />
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-ink transition hover:bg-sage-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest lg:hidden"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      </Container>

      <WalletBalanceStrip className="w-full border-t border-line/80 bg-canvas/90 px-5 py-2 backdrop-blur-lg lg:hidden" />

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="border-t border-line bg-canvas px-5 pb-5 pt-3 lg:hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              {navItems.map((item) => (
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
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
