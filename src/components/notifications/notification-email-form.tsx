"use client";

import { BellRing, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/components/wallet/wallet-provider";
import { notificationApi } from "@/features/notifications/api";

export function NotificationEmailForm() {
  const { address } = useWallet();
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let active = true;
    notificationApi.getProfile().then(
      (profile) => {
        if (!active) return;
        setEmail(profile.email ?? "");
        setSavedEmail(profile.email);
      },
      (loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load notification settings.");
      },
    );
    return () => {
      active = false;
    };
  }, [address]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await notificationApi.saveEmail(email);
      setEmail(result.email);
      setSavedEmail(result.email);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save notification settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="email-notifications-heading" className="mt-6 border-t border-line pt-6">
      <div className="flex items-start gap-2.5">
        <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <div><h2 id="email-notifications-heading" className="text-sm font-bold text-ink-muted">Essential email notifications</h2><p className="mt-1 text-xs leading-5 text-ink-faint">Optional preferences for purchase, gift, redemption, refund, and sold-out confirmations.</p></div>
      </div>
      <form className="mt-4 grid max-w-2xl gap-3" onSubmit={save}>
        <Input className="min-w-0 flex-1" label="Notification email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button className="w-full sm:w-fit" disabled={saving || email === savedEmail} type="submit" variant="secondary">
          {saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : savedEmail === email && email ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
          {savedEmail === email && email ? "Saved" : "Save email"}
        </Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
