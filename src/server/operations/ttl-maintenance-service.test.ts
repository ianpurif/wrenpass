// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createCoreMaintenanceBatches,
  isMissingMaintenanceFunctionError,
} from "@/server/operations/ttl-maintenance-service";

describe("createCoreMaintenanceBatches", () => {
  it("uses the contract's exact shared page limit without dropping entries", () => {
    const batches = createCoreMaintenanceBatches(BigInt(101), BigInt(1));

    expect(batches.map((batch) => batch.campaignIds.length + batch.passIds.length))
      .toEqual([50, 50, 2]);
    expect(batches.flatMap((batch) => batch.campaignIds)).toHaveLength(101);
    expect(batches.flatMap((batch) => batch.passIds)).toEqual([BigInt(1)]);
  });

  it("does not create invalid empty contract calls", () => {
    expect(createCoreMaintenanceBatches(BigInt(0), BigInt(0))).toEqual([]);
  });

  it("recognizes only the legacy missing maintenance function error", () => {
    expect(isMissingMaintenanceFunctionError(new Error(
      "trying to invoke non-existent contract function, maintain_storage",
    ))).toBe(true);
    expect(isMissingMaintenanceFunctionError(new Error("RPC request failed"))).toBe(false);
  });
});
