// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Firestore security rules", () => {
  it("explicitly denies client access to Testnet customer wallets and defaults to deny", async () => {
    const rules = await readFile(resolve(process.cwd(), "firestore.rules"), "utf8");

    expect(rules).toMatch(
      /match \/testnet_customer_wallets\/\{walletId\}[\s\S]*?allow read, write: if false;/,
    );
    expect(rules).toMatch(
      /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/,
    );
  });
});
