"use client";

import { BellRing, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card className="p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint-soft text-forest"><BellRing aria-hidden="true" className="size-4" /></span>
        <div><h2 className="font-extrabold text-ink">Essential email notifications</h2><p className="mt-1 text-sm leading-6 text-ink-muted">Optional. Receive purchase, gift, redemption, refund, and sold-out confirmations for this wallet.</p></div>
      </div>
      <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={save}>
        <Input className="min-w-0 flex-1" label="Notification email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button disabled={saving || email === savedEmail} type="submit">
          {saving ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : savedEmail === email && email ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
          {savedEmail === email && email ? "Saved" : "Save email"}
        </Button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </Card>
  );
}
