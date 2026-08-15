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
const passCollectionSchema = z.object({
  passes: z.array(customerPassSchema),
});
const activityWindowSchema = z.object({
  activity: z.array(activitySchema),
  activityWindowStartsAt: z.string().datetime(),
});
type CustomerPassCollection = z.infer<typeof passCollectionSchema>;
type CustomerActivityWindow = z.infer<typeof activityWindowSchema>;
type CustomerDashboard = CustomerPassCollection & CustomerActivityWindow;
const CUSTOMER_REQUEST_TIMEOUT_MS = 20_000;
const CUSTOMER_REQUEST_ATTEMPTS = 2;
const CUSTOMER_RETRY_DELAY_MS = 250;
const CUSTOMER_CACHE_MS = 30_000;
const passRequests = new Map<string, Promise<CustomerPassCollection>>();
const activityRequests = new Map<string, Promise<CustomerActivityWindow>>();
const passCache = new Map<string, { value: CustomerPassCollection; expiresAt: number }>();
const activityCache = new Map<string, { value: CustomerActivityWindow; expiresAt: number }>();

class CustomerRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "CustomerRequestError";
  }
}

async function requestJson(url: string, timeoutMessage: string): Promise<unknown> {
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
      throw new CustomerRequestError(timeoutMessage, true);
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

async function loadResource<T>(
  url: string,
  schema: z.ZodType<T>,
  timeoutMessage: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CUSTOMER_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return schema.parse(await requestJson(url, timeoutMessage));
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
  getPasses(
    walletAddress: string,
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ) {
    const cached = passCache.get(walletAddress);
    if (!options.refresh && cached && cached.expiresAt > Date.now()) {
      return waitForConsumer(Promise.resolve(cached.value), options.signal);
    }
    if (cached) passCache.delete(walletAddress);

    let request = passRequests.get(walletAddress);
    if (!request) {
      request = loadResource(
        "/api/customer/passes",
        passCollectionSchema,
        "Reading passes from Stellar timed out. Please try again.",
      )
        .then((value) => {
          passCache.set(walletAddress, {
            value,
            expiresAt: Date.now() + CUSTOMER_CACHE_MS,
          });
          return value;
        })
        .finally(() => {
          if (passRequests.get(walletAddress) === request) {
            passRequests.delete(walletAddress);
          }
        });
      passRequests.set(walletAddress, request);
    }
    return waitForConsumer(request, options.signal);
  },

  getActivity(
    walletAddress: string,
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ) {
    const cached = activityCache.get(walletAddress);
    if (!options.refresh && cached && cached.expiresAt > Date.now()) {
      return waitForConsumer(Promise.resolve(cached.value), options.signal);
    }
    if (cached) activityCache.delete(walletAddress);

    let request = activityRequests.get(walletAddress);
    if (!request) {
      request = loadResource(
        "/api/customer/activity",
        activityWindowSchema,
        "Reading recent activity from Stellar timed out. Please try again.",
      )
        .then((value) => {
          activityCache.set(walletAddress, {
            value,
            expiresAt: Date.now() + CUSTOMER_CACHE_MS,
          });
          return value;
        })
        .finally(() => {
          if (activityRequests.get(walletAddress) === request) {
            activityRequests.delete(walletAddress);
          }
        });
      activityRequests.set(walletAddress, request);
    }
    return waitForConsumer(request, options.signal);
  },

  invalidate(walletAddress: string) {
    passCache.delete(walletAddress);
    activityCache.delete(walletAddress);
  },

  async getDashboard(walletAddress: string, options: { signal?: AbortSignal } = {}): Promise<CustomerDashboard> {
    const [passCollection, activityWindow] = await Promise.all([
      this.getPasses(walletAddress, options),
      this.getActivity(walletAddress, options),
    ]);
    return { ...passCollection, ...activityWindow };
  },
};
