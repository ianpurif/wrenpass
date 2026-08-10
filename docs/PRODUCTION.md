# Production release evidence

## Release identity

| Field | Verified value |
| --- | --- |
| Stable URL | [https://wrenpass.vercel.app](https://wrenpass.vercel.app) |
| Vercel deployment | `dpl_3ssgmpWXeEJcsgcU65g2VwEbWyWa` |
| Immutable deployment URL | [wrenpass-7qxc6tim5-sacredmind2002gmailcoms-projects.vercel.app](https://wrenpass-7qxc6tim5-sacredmind2002gmailcoms-projects.vercel.app) |
| Source commit | `991ac54f7710823807de4ee0a4dc16a673297fea` |
| Target | Vercel production |
| Status | Ready |
| Released | 2026-08-11 01:49 PHT |

The stable alias resolved to the immutable deployment and returned the expected WrenPass landing page. The release was built by Vercel from a clean Git export of the recorded source commit; generated output, dependencies, local environment files, credentials, and contract build caches were excluded from the upload.

## Live verification

The following checks were run against the stable production URL after deployment:

| Check | Result |
| --- | --- |
| Landing page | `200`, correct production title and content |
| Anonymous wallet session | `200`, unauthenticated session returned safely |
| On-chain reviews | `200`, live Soroban-backed review data returned |
| Operations endpoint without authorization | `401` |
| Operations endpoint with `CRON_SECRET` | `200` |
| Event recovery | Checkpoint advanced; no duplicates or failures |
| Contract TTL inspection | 25 entries inspected; minimum 492,544 ledgers remaining |

The authorized operations run submitted no TTL transactions because every inspected entry was already above the maintenance threshold. This confirms the production scheduler path can reach Firestore and Stellar without performing unnecessary writes.

## Monitoring and analytics

- **Sentry:** production configuration and project access were verified. A labeled production verification event was dispatched successfully with event ID `5b89e973-00ae-4656-a206-0ca96f522084` and release `991ac54f7710823807de4ee0a4dc16a673297fea`.
- **PostHog:** the production page loaded the configured PostHog client, remote configuration, surveys, dead-click, and Web Vitals resources. Project access and ingestion were manually verified by the operator.
- **Vercel:** Web Analytics and Speed Insights scripts loaded from the production origin. The deployment and monitoring dashboards were manually verified by the operator.

Monitoring screenshots are submission artifacts rather than runtime dependencies. They should show the Vercel production deployment, the labeled Sentry verification event, and PostHog production activity without exposing provider tokens, email addresses, wallet addresses, or other sensitive data.

## Operational controls

- All required production environment variables are encrypted in Vercel for Preview and Production.
- `/api/cron/operations` requires the exact bearer credential and uses a Firestore lease to make duplicate deliveries safe.
- Sentry removes request bodies, cookies, headers, query strings, and default PII before transmission.
- PostHog accepts only an explicit product-event allowlist and excludes wallet addresses, emails, transaction hashes, review messages, and financial values.
- On-chain state remains authoritative if monitoring, event indexing, or notification delivery is temporarily unavailable.

See [OPERATIONS.md](OPERATIONS.md) for recovery procedures and alerting guidance, and [DEPLOYMENT.md](DEPLOYMENT.md) for the protected build-once delivery workflow.
