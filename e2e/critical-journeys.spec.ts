import { expect, test, type Page } from "@playwright/test";

async function useDisconnectedWallet(page: Page): Promise<void> {
  await page.route("**/api/wallet/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await useDisconnectedWallet(page);
});

test("landing page settles into a usable disconnected state", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  await expect(
    page.getByRole("link", { name: "WrenPass home" }).getByRole("img", { name: "WrenPass" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Freighter" })).toBeVisible();
  await expect(page.getByText("Checking wallet", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Merchant dashboard" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My passes" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("wallet-only pages redirect before rendering private workspaces", async ({ page }) => {
  const protectedPaths = [
    "/merchant",
    "/merchant/business-identity",
    "/merchant/create-campaign",
    "/merchant/redeem-pass",
    "/passes",
  ];

  for (const path of protectedPaths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Checking wallet access")).toHaveCount(0);
  }
});

test("mobile navigation stays inside the viewport and omits wallet-only links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation menu" }).click();

  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("button", { name: "Connect Freighter" })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Merchant dashboard" })).toHaveCount(0);
  await expect(mobileNavigation.getByRole("link", { name: "My passes" })).toHaveCount(0);

  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflowsViewport).toBe(false);
});
