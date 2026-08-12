import { describe, expect, it, vi } from "vitest";

import { createAndPublishCampaign } from "@/features/merchant/campaign-workflow";
import type { CampaignContractWriter } from "@/lib/stellar/wrenpass-client";
import type { AtomicCampaignPublisher } from "@/lib/stellar/publisher-client";

const merchant = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const signTransaction = vi.fn();
const metadata = {
  name: "Future haircut",
  serviceDescription: "One complete haircut service at the merchant location.",
};
const terms = {
  pass_price: BigInt(50_000_000),
  service_value: BigInt(60_000_000),
  max_supply: 100,
  expires_at: BigInt(2_000_000_000),
  financial_rules: { merchant_bps: 7_500, reserve_bps: 2_000, platform_fee_bps: 500 },
};

describe("campaign publishing workflow", () => {
  it("uses one atomic contract call when the publisher is configured", async () => {
    const writer: CampaignContractWriter = {
      createDraft: vi.fn(),
      publish: vi.fn(),
    };
    const atomicPublisher: AtomicCampaignPublisher = {
      createAndPublish: vi.fn().mockResolvedValue(BigInt(7)),
    };
    const saveMetadata = vi.fn();
    const saveMetadataReference = vi.fn();

    await expect(
      createAndPublishCampaign(
        { merchant, signTransaction, metadata, terms },
        { writer, atomicPublisher, saveMetadata, saveMetadataReference },
      ),
    ).resolves.toBe("7");

    expect(atomicPublisher.createAndPublish).toHaveBeenCalledWith({
      merchant,
      signTransaction,
      metadata,
      terms,
    });
    expect(saveMetadataReference).toHaveBeenCalledWith({ ...metadata, campaignId: "7" });
    expect(writer.createDraft).not.toHaveBeenCalled();
    expect(writer.publish).not.toHaveBeenCalled();
    expect(saveMetadata).not.toHaveBeenCalled();
  });

  it("does not publish when metadata registration fails", async () => {
    const writer: CampaignContractWriter = {
      createDraft: vi.fn().mockResolvedValue(BigInt(7)),
      publish: vi.fn(),
    };
    const saveMetadata = vi.fn().mockRejectedValue(new Error("Metadata registration unavailable"));

    await expect(
      createAndPublishCampaign(
        { merchant, signTransaction, metadata, terms },
        {
          writer,
          saveMetadata,
        },
      ),
    ).rejects.toThrow("Metadata registration unavailable");

    expect(saveMetadata).toHaveBeenCalledWith({ ...metadata, campaignId: "7" });
    expect(writer.publish).not.toHaveBeenCalled();
  });

  it("registers metadata and publishes the created campaign", async () => {
    const writer: CampaignContractWriter = {
      createDraft: vi.fn().mockResolvedValue(BigInt(7)),
      publish: vi.fn(),
    };
    const saveMetadata = vi.fn();

    await expect(
      createAndPublishCampaign(
        { merchant, signTransaction, metadata, terms },
        { writer, saveMetadata },
      ),
    ).resolves.toBe("7");

    expect(saveMetadata).toHaveBeenCalledWith({
      ...metadata,
      campaignId: "7",
    });
    expect(writer.publish).toHaveBeenCalledWith({
      campaignId: BigInt(7),
      merchant,
      signTransaction,
    });
    expect(saveMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(writer.publish).mock.invocationCallOrder[0],
    );
  });
});
