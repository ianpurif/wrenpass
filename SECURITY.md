# Security policy

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use GitHub's private vulnerability reporting or security-advisory flow for this repository and include reproduction steps, affected routes or contract functions, and the observed impact. Do not include seed phrases, private keys, session cookies, provider credentials, or customer data.

## Trust boundaries

- Wallet authority comes from a server-verified SEP-53 challenge and opaque session, never a client-provided address alone.
- Financial truth, campaign supply, settlement, pass ownership, gifting, redemption, reserve release, and refunds are enforced by Soroban.
- A QR code identifies a pass but cannot authorize redemption.
- Firestore is operational storage and an index, not financial or ownership authority.
- Review sponsorship is server-controlled, rate-limited, and sequence-serialized. Sponsor secrets remain server-side.
- Cloudinary, Firebase, Gmail, Sentry, PostHog, and Vercel credentials are server or CI secrets and must never use a `NEXT_PUBLIC_` prefix.

## Automated controls

Pull requests and `main` are gated by frozen dependency installation, high/critical dependency auditing, ESLint, TypeScript, unit/integration tests, production build, Rust formatting and clippy, Soroban tests/builds, deployed-WASM provenance verification, and critical browser journeys. GitHub Actions are pinned to immutable commit SHAs, and Dependabot monitors JavaScript, Rust, and workflow dependencies.

One low-severity `elliptic` advisory is currently inherited through optional wallet-kit integrations. No patched version is available through the installed wallet-kit graph. CI fails at high severity or above; this low-severity advisory must be re-evaluated whenever Stellar Wallets Kit is updated.
