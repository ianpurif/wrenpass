// @vitest-environment node

import { describe, expect, it } from "vitest";

import { hasValidCronAuthorization } from "@/server/operations/cron-auth";

describe("hasValidCronAuthorization", () => {
  const secret = "a-production-length-cron-secret-value";

  it("accepts only the exact scheduler bearer credential", () => {
    expect(hasValidCronAuthorization(`Bearer ${secret}`, secret)).toBe(true);
    expect(hasValidCronAuthorization(secret, secret)).toBe(false);
    expect(hasValidCronAuthorization(`Bearer ${secret}x`, secret)).toBe(false);
    expect(hasValidCronAuthorization(null, secret)).toBe(false);
  });
});
