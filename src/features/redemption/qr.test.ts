import { describe, expect, it } from "vitest";

import {
  encodeRedemptionQrPayload,
  parseRedemptionQrPayload,
} from "@/features/redemption/qr";

const contractId = "CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D";

describe("redemption QR payload", () => {
  it("round-trips a versioned pass identity without an owner or secret", () => {
    const encoded = encodeRedemptionQrPayload({
      network: "testnet",
      contractId,
      passId: "1",
    });

    expect(parseRedemptionQrPayload(encoded)).toEqual({
      v: 1,
      type: "wrenpass:redeem",
      network: "testnet",
      contractId,
      passId: "1",
    });
    expect(encoded).not.toContain("owner");
    expect(encoded).not.toContain("secret");
  });

  it.each([
    "not-json",
    JSON.stringify({ v: 1, type: "wrenpass:redeem", network: "testnet", contractId, passId: "0" }),
    JSON.stringify({ v: 2, type: "wrenpass:redeem", network: "testnet", contractId, passId: "1" }),
    JSON.stringify({ v: 1, type: "wrenpass:redeem", network: "testnet", contractId: "CINVALID", passId: "1" }),
  ])("rejects an invalid payload", (encoded) => {
    expect(() => parseRedemptionQrPayload(encoded)).toThrow(
      "This is not a valid WrenPass redemption QR code.",
    );
  });
});
