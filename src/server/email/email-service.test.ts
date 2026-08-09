import { describe, expect, it, vi } from "vitest";

import {
  buildNotificationEmail,
  EmailService,
  resolveSenderAddress,
  type MailTransport,
} from "@/server/email/email-service";

function createTransport(): MailTransport {
  return {
    verify: vi.fn(async () => true as const),
    sendMail: vi.fn(async () => ({ messageId: "message-1" })),
  };
}

describe("email service", () => {
  it("combines a display label with the authenticated Gmail mailbox", () => {
    expect(resolveSenderAddress("WrenPass", "sender@example.com")).toBe(
      "WrenPass <sender@example.com>",
    );
    expect(
      resolveSenderAddress("WrenPass Alerts <alerts@example.com>", "sender@example.com"),
    ).toBe("WrenPass Alerts <alerts@example.com>");
  });

  it("escapes dynamic content in generated HTML", () => {
    const message = buildNotificationEmail({
      to: "customer@example.com",
      subject: "Pass update",
      heading: "Welcome <Customer>",
      body: "Your pass is ready & protected.",
    });

    expect(message.html).toContain("Welcome &lt;Customer&gt;");
    expect(message.html).toContain("ready &amp; protected");
    expect(message.text).toContain("Welcome <Customer>");
  });

  it("verifies SMTP and disables remote or file content when sending", async () => {
    const transport = createTransport();
    const service = new EmailService(transport, "WrenPass <sender@example.com>");
    const message = buildNotificationEmail({
      to: "customer@example.com",
      subject: "Pass update",
      heading: "Your pass is ready",
      body: "Open WrenPass to review it.",
    });

    await expect(service.verifyConnection()).resolves.toBeUndefined();
    await expect(service.send(message)).resolves.toBe("message-1");
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ disableFileAccess: true, disableUrlAccess: true }),
    );
  });

  it("surfaces transport failures", async () => {
    const transport = createTransport();
    vi.mocked(transport.sendMail).mockRejectedValueOnce(new Error("smtp unavailable"));
    const service = new EmailService(transport, "WrenPass <sender@example.com>");

    await expect(
      service.send(
        buildNotificationEmail({
          to: "customer@example.com",
          subject: "Pass update",
          heading: "Your pass is ready",
          body: "Open WrenPass to review it.",
        }),
      ),
    ).rejects.toThrow("smtp unavailable");
  });

  it("rejects invalid recipient addresses before generating a message", () => {
    expect(() =>
      buildNotificationEmail({
        to: "not-an-email",
        subject: "Pass update",
        heading: "Your pass is ready",
        body: "Open WrenPass to review it.",
      }),
    ).toThrow();
  });
});
