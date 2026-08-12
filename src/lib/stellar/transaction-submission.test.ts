import { describe, expect, it, vi } from "vitest";

import { submitWithFreshAccountSequence } from "@/lib/stellar/transaction-submission";

describe("submitWithFreshAccountSequence", () => {
  it("reassembles after an explicit bad-sequence rejection", async () => {
    const assembleSignAndSend = vi.fn()
      .mockRejectedValueOnce(new Error('{"result":{"_switch":{"name":"txBadSeq"}}}'))
      .mockResolvedValueOnce("submitted");

    await expect(submitWithFreshAccountSequence({
      account: "GBADSEQUENCE",
      assembleSignAndSend,
      badSequenceRetryDelaysMs: [0],
    })).resolves.toBe("submitted");

    expect(assembleSignAndSend).toHaveBeenCalledTimes(2);
  });

  it("does not replay an ambiguous transaction failure", async () => {
    const error = new Error("Timed out while waiting for the transaction result.");
    const assembleSignAndSend = vi.fn().mockRejectedValue(error);

    await expect(submitWithFreshAccountSequence({
      account: "GAMBIGUOUS",
      assembleSignAndSend,
      badSequenceRetryDelaysMs: [0],
    })).rejects.toBe(error);

    expect(assembleSignAndSend).toHaveBeenCalledOnce();
  });

  it("serializes transaction assembly for the same account", async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = submitWithFreshAccountSequence({
      account: "GSERIALIZED",
      assembleSignAndSend: async () => {
        calls.push("first started");
        await firstCanFinish;
        calls.push("first finished");
        return 1;
      },
    });
    const second = submitWithFreshAccountSequence({
      account: "GSERIALIZED",
      assembleSignAndSend: async () => {
        calls.push("second started");
        return 2;
      },
    });

    await vi.waitFor(() => expect(calls).toEqual(["first started"]));
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(calls).toEqual(["first started", "first finished", "second started"]);
  });
});
