import { z } from "zod";

import { publicCampaignSchema } from "@/features/merchant/api";

const integerStringSchema = z.string().regex(/^\d+$/);
const passStatusSchema = z.enum(["Active", "Redeemed", "Expired", "Refunded"]);
const customerPassSchema = z.object({
  id: integerStringSchema,
  campaignId: integerStringSchema,
  owner: z.string(),
  status: passStatusSchema,
  purchasedAt: integerStringSchema,
  purchaseAmounts: z.object({
    total: integerStringSchema,
    merchantRelease: integerStringSchema,
    protectedReserve: integerStringSchema,
    platformFee: integerStringSchema,
  }),
  campaign: publicCampaignSchema.nullable(),
});
const activitySchema = z.object({
  id: z.string(),
  kind: z.enum(["Purchased", "Gifted", "Received", "Redeemed", "Refunded"]),
  campaignId: integerStringSchema,
  passId: integerStringSchema,
  occurredAt: z.string().datetime(),
  transactionHash: z.string().regex(/^[a-f\d]{64}$/),
  amount: integerStringSchema.optional(),
  counterparty: z.string().optional(),
});
const dashboardSchema = z.object({
  passes: z.array(customerPassSchema),
  activity: z.array(activitySchema),
  activityWindowStartsAt: z.string().datetime(),
});

type CustomerDashboard = z.infer<typeof dashboardSchema>;
const CUSTOMER_REQUEST_TIMEOUT_MS = 20_000;
const CUSTOMER_REQUEST_ATTEMPTS = 2;
const CUSTOMER_RETRY_DELAY_MS = 250;
const dashboardRequests = new Map<string, Promise<CustomerDashboard>>();

class CustomerRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "CustomerRequestError";
  }
}

async function requestJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CUSTOMER_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new CustomerRequestError(
        "Reading passes from Stellar timed out. Please try again.",
        true,
      );
    }
    throw new CustomerRequestError(
      error instanceof Error ? error.message : "Unable to reach the customer service.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.text();
  let payload: { error?: unknown } | null = null;
  if (responseBody) {
    try {
      payload = JSON.parse(responseBody) as { error?: unknown };
    } catch {
      throw new CustomerRequestError("The customer service returned an invalid response.", false);
    }
  }
  if (!response.ok) {
    throw new CustomerRequestError(
      payload && typeof payload.error === "string"
        ? payload.error
        : "The customer request could not be completed.",
      [502, 503, 504].includes(response.status),
    );
  }
  return payload;
}

async function loadDashboard(): Promise<CustomerDashboard> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CUSTOMER_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return dashboardSchema.parse(await requestJson("/api/customer/passes"));
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof CustomerRequestError) ||
        !error.retryable ||
        attempt === CUSTOMER_REQUEST_ATTEMPTS
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CUSTOMER_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

function waitForConsumer<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException("The request was cancelled.", "AbortError"));

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("The request was cancelled.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export const customerApi = {
  getDashboard(walletAddress: string, options: { signal?: AbortSignal } = {}) {
    let request = dashboardRequests.get(walletAddress);
    if (!request) {
      request = loadDashboard().finally(() => {
        if (dashboardRequests.get(walletAddress) === request) {
          dashboardRequests.delete(walletAddress);
        }
      });
      dashboardRequests.set(walletAddress, request);
    }
    return waitForConsumer(request, options.signal);
  },
};
