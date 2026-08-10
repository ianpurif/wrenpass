import "server-only";

import { timingSafeEqual } from "node:crypto";

export function hasValidCronAuthorization(
  authorizationHeader: string | null,
  cronSecret: string,
): boolean {
  const expectedBytes = Buffer.from(`Bearer ${cronSecret}`);
  const actualBytes = Buffer.from(authorizationHeader ?? "");
  return expectedBytes.length === actualBytes.length
    && timingSafeEqual(expectedBytes, actualBytes);
}
