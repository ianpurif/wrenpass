import { z } from "zod";

const profileSchema = z.object({ email: z.email().nullable() });
const syncResultSchema = z.object({
  indexed: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  notificationsSent: z.number().int().nonnegative(),
  notificationFailures: z.number().int().nonnegative(),
});

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const responseBody = await response.text();
  let data: { error?: unknown } = {};
  if (responseBody) {
    try {
      data = JSON.parse(responseBody) as { error?: unknown };
    } catch {
      throw new Error(
        response.ok
          ? "The notification service returned an invalid response."
          : "The notification service is temporarily unavailable.",
      );
    }
  }
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The notification request failed.");
  }
  if (!responseBody) throw new Error("The notification service returned an empty response.");
  return data;
}

export const notificationApi = {
  async getProfile(): Promise<{ email: string | null }> {
    return profileSchema.parse(await requestJson("/api/notifications/profile"));
  },
  async saveEmail(email: string): Promise<{ email: string }> {
    const result = profileSchema.parse(
      await requestJson("/api/notifications/profile", {
        method: "PUT",
        body: JSON.stringify({ email }),
      }),
    );
    if (!result.email) throw new Error("The notification email was not saved.");
    return { email: result.email };
  },
  async syncEvents() {
    return syncResultSchema.parse(await requestJson("/api/events/sync", { method: "POST" }));
  },
};
