import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  campaignStories,
  campaignStoryIndex,
  CinematicLanding,
} from "@/components/home/cinematic-landing";

vi.mock("@/components/wallet/connected-wallet-link", () => ({
  ConnectedWalletLink: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
});

describe("CinematicLanding", () => {
  it("defines two internally consistent campaign stories", () => {
    expect(campaignStories.map((story) => story.preview.businessName)).toEqual([
      "Northline Studio",
      "Harbor Cycle Works",
    ]);
    for (const story of campaignStories) {
      expect(story.preview.sold + story.preview.remaining).toBe(story.preview.issued);
    }
  });

  it("uses a small threshold buffer so the card does not flicker while scrolling", () => {
    expect(campaignStoryIndex(0.53, 0)).toBe(0);
    expect(campaignStoryIndex(0.54, 0)).toBe(1);
    expect(campaignStoryIndex(0.47, 1)).toBe(1);
    expect(campaignStoryIndex(0.46, 1)).toBe(0);
  });

  it("keeps the background video decorative, local to the hero, and autoplay-safe", () => {
    const { container } = render(<CinematicLanding />);
    const video = container.querySelector("video");

    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("playsinline");
    expect(video?.querySelector("source")).toHaveAttribute("src", "/bg.mp4");
    expect(video?.closest("section")).toHaveAccessibleName("Working capital, backed by real service.");
  });

  it("presents the complete landing-page story in order", () => {
    render(<CinematicLanding />);

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent?.replace(/\s+/g, " ").trim());

    expect(headings).toEqual([
      "Working capital, backed by real service.",
      "Five today. Six in service.",
      "Studio supporter pass",
      "Support moves forward.",
      "The business sets the promise.",
      "Customers fund it today.",
      "The service completes the exchange.",
      "Fund what comes next, with what you do best.",
      "The QR identifies. The owner authorizes.",
      "What people say after using WrenPass.",
      "Let tomorrow's service fund today's possibility.",
    ]);
    expect(screen.getByText("Northline Studio")).toBeInTheDocument();
    expect(screen.queryByText("Harbor Cycle Works")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All reviews/ })).toHaveAttribute("href", "/reviews");
  });
});
