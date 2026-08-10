import type { Metadata } from "next";

import { Footer } from "@/components/layout/footer";
import { Navigation } from "@/components/layout/navigation";
import { ReviewPromptProvider } from "@/components/reviews/review-prompt-provider";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { getStellarConfig } from "@/lib/stellar/config";

import "./globals.css";

export const metadata: Metadata = {
  title: "WrenPass | Future service, funded today",
  description:
    "WrenPass helps small businesses raise working capital by pre-selling limited future service passes on Stellar.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const stellarConfig = getStellarConfig();

  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <WalletProvider config={stellarConfig}>
          <ReviewPromptProvider config={stellarConfig}>
            <a
              href="#main-content"
              className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              Skip to content
            </a>
            <Navigation />
            {children}
            <Footer />
          </ReviewPromptProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
