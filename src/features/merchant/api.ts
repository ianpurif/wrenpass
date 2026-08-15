import { z } from "zod";

import type { CampaignMetadataInput, MerchantProfileUpdate } from "@/server/merchant/merchant-service";
import {
  campaignMetadataSchema,
  merchantSchema,
} from "@/server/models";

const integerStringSchema = z.string().regex(/^\d+$/);
export const onchainCampaignSchema = z.object({
  id: integerStringSchema,
  merchant: z.string(),
  passPrice: integerStringSchema,
  serviceValue: integerStringSchema,
  maxSupply: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  redeemed: z.number().int().nonnegative(),
  refunded: z.number().int().nonnegative(),
  merchantReleased: integerStringSchema,
  protectedFunds: integerStringSchema,
  platformFeesPaid: integerStringSchema,
  expiresAt: integerStringSchema,
  financialRules: z.object({
    merchantBps: z.number().int().nonnegative(),
    reserveBps: z.number().int().nonnegative(),
    platformFeeBps: z.number().int().nonnegative(),
  }),
  status: z.enum(["Draft", "Active", "Paused", "Expired", "Cancelled"]),
});
export const merchantCampaignSchema = z.object({
  metadata: campaignMetadataSchema,
  onchain: onchainCampaignSchema,
});
const merchantDashboardSchema = z.object({
  merchant: merchantSchema.nullable(),
  campaigns: z.array(merchantCampaignSchema),
});
const profileResponseSchema = z.object({ merchant: merchantSchema.nullable() });
const savedProfileResponseSchema = z.object({ merchant: merchantSchema });
const savedMetadataResponseSchema = z.object({ metadata: campaignMetadataSchema });
const uploadResponseSchema = z.object({
  url: z.url(),
  publicId: z.string().min(1),
  sha256: z.string().regex(/^[a-f\d]{64}$/i),
});
export const publicCampaignSchema = merchantCampaignSchema.extend({ merchant: merchantSchema });
type MerchantDashboard = z.infer<typeof merchantDashboardSchema>;

const DASHBOARD_TIMEOUT_MS = 20_000;
const DASHBOARD_ATTEMPTS = 2;
const DASHBOARD_RETRY_DELAY_MS = 250;
const DASHBOARD_CACHE_MS = 30_000;
const dashboardRequests = new Map<string, Promise<MerchantDashboard>>();
const dashboardCache = new Map<string, { value: MerchantDashboard; expiresAt: number }>();

class MerchantDashboardRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "MerchantDashboardRequestError";
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "The merchant request could not be completed.",
    );
  }
  return payload;
}

async function requestDashboard(): Promise<MerchantDashboard> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DASHBOARD_TIMEOUT_MS);
  try {
    const response = await fetch("/api/merchant/campaigns", {
      credentials: "same-origin",
      signal: controller.signal,
    });
    const responseBody = await response.text();
    let payload: unknown = null;
    if (responseBody) {
      try {
        payload = JSON.parse(responseBody);
      } catch {
        throw new MerchantDashboardRequestError(
          "The merchant service returned an invalid response.",
          false,
        );
      }
    }
    if (!response.ok) {
      const errorPayload = payload as { error?: unknown } | null;
      throw new MerchantDashboardRequestError(
        errorPayload && typeof errorPayload.error === "string"
          ? errorPayload.error
          : "The merchant dashboard could not be loaded.",
        [502, 503, 504].includes(response.status),
      );
    }
    return merchantDashboardSchema.parse(payload);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new MerchantDashboardRequestError(
        "Loading the merchant workspace timed out. Please try again.",
        true,
      );
    }
    if (error instanceof MerchantDashboardRequestError) throw error;
    if (error instanceof z.ZodError) {
      throw new MerchantDashboardRequestError(
        "The merchant service returned an invalid dashboard.",
        false,
      );
    }
    throw new MerchantDashboardRequestError(
      error instanceof Error ? error.message : "Unable to reach the merchant service.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDashboard(): Promise<MerchantDashboard> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DASHBOARD_ATTEMPTS; attempt += 1) {
    try {
      return await requestDashboard();
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof MerchantDashboardRequestError) ||
        !error.retryable ||
        attempt === DASHBOARD_ATTEMPTS
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, DASHBOARD_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

function waitForConsumer<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) {
    return Promise.reject(new DOMException("The request was cancelled.", "AbortError"));
  }

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

export const merchantApi = {
  async getProfile() {
    return profileResponseSchema.parse(await requestJson("/api/merchant/profile")).merchant;
  },
  async saveProfile(input: MerchantProfileUpdate) {
    const merchant = savedProfileResponseSchema.parse(
      await requestJson("/api/merchant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ).merchant;
    dashboardCache.delete(merchant.id);
    return merchant;
  },
  getDashboard(
    walletAddress: string,
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ) {
    const cached = dashboardCache.get(walletAddress);
    if (!options.refresh && cached && cached.expiresAt > Date.now()) {
      return waitForConsumer(Promise.resolve(cached.value), options.signal);
    }
    if (cached) dashboardCache.delete(walletAddress);

    let request = dashboardRequests.get(walletAddress);
    if (!request) {
      request = loadDashboard()
        .then((value) => {
          dashboardCache.set(walletAddress, {
            value,
            expiresAt: Date.now() + DASHBOARD_CACHE_MS,
          });
          return value;
        })
        .finally(() => {
          if (dashboardRequests.get(walletAddress) === request) {
            dashboardRequests.delete(walletAddress);
          }
        });
      dashboardRequests.set(walletAddress, request);
    }
    return waitForConsumer(request, options.signal);
  },
  invalidateDashboard(walletAddress: string) {
    dashboardCache.delete(walletAddress);
  },
  async saveCampaignMetadata(input: CampaignMetadataInput) {
    const metadata = savedMetadataResponseSchema.parse(
      await requestJson("/api/merchant/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ).metadata;
    dashboardCache.delete(metadata.merchantId);
    return metadata;
  },
  async uploadImage(kind: "merchant-logo" | "campaign-image", file: File) {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    return uploadResponseSchema.parse(
      await requestJson("/api/merchant/images", { method: "POST", body }),
    );
  },
};
