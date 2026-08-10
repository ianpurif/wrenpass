import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
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
