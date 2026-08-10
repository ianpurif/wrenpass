import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const production = process.env.NODE_ENV === "production";
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: production && Boolean(sentryDsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) {
    delete event.user;
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.headers;
      delete event.request.query_string;
    }
    return event;
  },
});

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
if (production && posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-05-30",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    disable_session_recording: true,
    person_profiles: "never",
    persistence: "localStorage",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
