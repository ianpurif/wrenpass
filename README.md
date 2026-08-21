<p align="center">
  <img src="public/logo.png" width="112" alt="WrenPass logo" />
</p>

<h1 align="center">WrenPass</h1>

<p align="center"><strong>Invest in a business you trust. Get more value back.</strong></p>

<p align="center">
  WrenPass helps small businesses unlock working capital by pre-selling limited future-service passes.<br />
  Customers pay with a Stellar asset today and receive more service value later.
</p>

| Name              | Evidence                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Live product      | [wrenpass.vercel.app](https://wrenpass.vercel.app)                                             |
| Demo video        | [Watch the WrenPass demo](https://x.com/wrenpasscorp/status/2087435276172120326?s=20)          |
| Pitch deck        | [WrenPass pitch deck](https://docs.google.com/presentation/d/1l36aUPqkt4kFOKeSLH_rNM5dZJEhT5Vf/edit?usp=sharing&ouid=100999101172428274179&rtpof=true&sd=true) |
| On-chain reviews  | [wrenpass.vercel.app/reviews](https://wrenpass.vercel.app/reviews)                             |
| Testnet contracts | [Deployment manifest](deployments/testnet.json)                                                |
| User-wallet proof | [55-wallet evidence table](#proof-of-10-user-wallets)                                          |
| User feedback     | [Feedback spreadsheet](https://docs.google.com/spreadsheets/d/1yemfWq2ck5gLixD1YWBz11nuzsmo38dh6v7O0RAebDw/edit?usp=sharing) |
| CI pipeline       | [CI workflow](https://github.com/ianpurif/wrenpass/actions/workflows/ci.yml)                   |
| Delivery pipeline | [Deploy to Vercel workflow](https://github.com/ianpurif/wrenpass/actions/workflows/deploy.yml) |

![WrenPass landing page](public/productui1.png)

## Contents

- [Belt progress](#belt-progress)
- [Product](#product)
- [How WrenPass works](#how-wrenpass-works)
- [Why Stellar](#why-stellar)
- [Core engineering challenge](#core-engineering-challenge)
- [Implemented product](#implemented-product)
- [Architecture](#architecture)
- [Soroban contracts](#soroban-contracts)
- [Testnet deployment proof](#testnet-deployment-proof)
- [Proof of 10+ user wallets](#proof-of-10-user-wallets)
- [User feedback](#user-feedback)
- [Product and engineering screenshots](#product-and-engineering-screenshots)
- [Run locally](#run-locally)
- [Test and verify](#test-and-verify)
- [CI/CD and production operations](#cicd-and-production-operations)
- [Level 5 proof](#level-5-proof)
- [Current limits and roadmap](#current-limits-and-roadmap)

## Belt progress

All five belt levels are documented as completed. The table is the judge-facing checklist; detailed explanations and reusable evidence appear only once in the linked sections.

| Level | Status | Requirements covered | Fast proof |
| --- | --- | --- | --- |
| 1 — White | ✅ Completed | Freighter wallet, Testnet balances, transaction feedback, deployed public app, meaningful commits | [Product flow](#how-wrenpass-works), [Testnet proof](#testnet-deployment-proof), [screenshots](#product-and-engineering-screenshots), [local setup](#run-locally) |
| 2 — Yellow | ✅ Completed | Wallet integration, Soroban deployment, contract calls, events, status/error handling | [Contracts](#soroban-contracts), [Testnet proof](#testnet-deployment-proof), [event recovery](#cicd-and-production-operations), [tests](#test-and-verify) |
| 3 — Orange | ✅ Completed | Advanced contracts, inter-contract calls, event streaming, CI/CD, responsive frontend, tests, production architecture, demo | [Contracts](#soroban-contracts), [architecture](#architecture), [tests](#test-and-verify), [CI/CD](#cicd-and-production-operations), [demo](https://x.com/wrenpasscorp/status/2087435276172120326?s=20) |
| 4 — Green | ✅ Completed | Production MVP, monitoring, analytics, UX quality, Testnet contracts, 15+ commits, 10+ wallet interactions, feedback | [Production evidence](docs/PRODUCTION.md), [monitoring](#monitoring-and-analytics), [wallet proof](#proof-of-10-user-wallets), [feedback](#user-feedback) |
| 5 — Blue | ✅ Completed | 50+ Testnet wallets, real activity, feedback-driven improvements, pitch, demo, 20+ commits, updated documentation | [Level 5 proof](#level-5-proof), [wallet proof](#proof-of-10-user-wallets), [feedback](#user-feedback), [pitch deck](https://docs.google.com/presentation/d/1l36aUPqkt4kFOKeSLH_rNM5dZJEhT5Vf/edit?usp=sharing&ouid=100999101172428274179&rtpof=true&sd=true) |

## Product

### Problem

Small businesses often need capital to buy equipment, add capacity, or expand. Bank loans can be expensive or unavailable. Equity funding is usually not practical for a local service business.

### Solution

WrenPass lets a business raise capital directly from customers who already trust it.

For example, a barber can publish this offer:

> Pay 4 USDC today and receive 5 USDC worth of haircuts later.

The business receives working capital now. The customer receives useful bonus value later. The business does not take a loan or give up ownership. The pass is service value, not a speculative token.

### Target users

- Barbers and salons
- Tutors and coaches
- Gyms and fitness instructors
- Repair shops
- Designers, creators, and other service providers
- Customers who want to support a trusted business and receive more value

Customers can use a pass or gift an active pass to another Stellar wallet.

## How WrenPass works

```text
Merchant creates an offer
        ↓
Soroban fixes the campaign terms and maximum pass supply
        ↓
Customer pays with the configured Stellar asset
        ↓
Contract splits merchant funds, protection reserve, and platform fee
        ↓
Customer receives a unique pass record
        ↓
Customer uses or gifts the pass
        ↓
Merchant scans the QR and the current owner approves redemption
        ↓
Soroban marks the pass redeemed and prevents reuse
```

The QR code identifies the pass. It is not a bearer credential. Scanning alone cannot redeem another person's pass.

### Customer flow

1. Open a merchant's shared campaign link.
2. Connect a Freighter wallet on Testnet.
3. Review the price, service value, bonus, expiration, remaining supply, and protected amount.
4. Approve the purchase transaction.
5. View the pass and purchase transaction in the customer workspace.
6. Use the pass, gift it, or show its branded QR code.
7. Approve redemption with the current owner's wallet.
8. Optionally submit an on-chain review. WrenPass sponsors the fee while the wallet still authorizes the review.

### Merchant flow

1. Connect and authenticate a Stellar wallet.
2. Publish the business profile.
3. Create a campaign with fixed financial terms, supply, and expiration.
4. Share the public campaign URL.
5. Track sales, funds, supply, and on-chain activity.
6. Scan a customer's pass QR code.
7. Request owner approval and complete redemption.

## Why Stellar

WrenPass needs payments, programmable rules, wallet authorization, asset access, and public verification in one system. Stellar provides these parts without adding a speculative token.

- **Soroban smart contracts** enforce campaign terms, supply, ownership, payment distribution, and lifecycle transitions.
- **Stellar Asset Contract integration** lets the campaign contract transfer the configured Stellar asset through a standard token interface.
- **Low-cost transactions** fit small service purchases and sponsored actions.
- **Fast finality** supports an in-person purchase and QR redemption flow.
- **Contract events and Stellar RPC** provide an auditable activity stream for the application indexer.
- **Freighter and Stellar Wallets Kit** give users non-custodial transaction approval.
- **Stellar Expert links** let judges and users inspect contracts and transactions independently.

Useful official references: [Soroban overview](https://developers.stellar.org/docs/build/smart-contracts/overview), [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract), [contract events](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events), [Stellar RPC](https://developers.stellar.org/docs/data/apis/rpc), and [wallet integration](https://developers.stellar.org/docs/tools/developer-tools/wallets).

## Core engineering challenge

The difficult part is connecting an on-chain pass to a real service without turning the QR into a transferable secret or the database into a financial authority.

WrenPass addresses that problem by:

- fixing supply and financial rules in Soroban before customers buy;
- moving the configured Stellar asset inside the contract instead of trusting a web-server payment record;
- assigning each pass to a wallet and checking the current owner on every gift, redemption, and refund;
- requiring both the correct merchant and current owner in the redemption flow;
- keeping the QR limited to pass identity;
- defining deterministic reserve and refund rules instead of adding an unverifiable dispute process;
- treating Firestore as a rebuildable operational index; and
- using idempotent recovery when RPC, indexing, or email delivery is temporarily unavailable.

The current product does not claim to solve merchant KYB or subjective service disputes. Those limits are stated in [Current limits](#current-limits).

## Implemented product

| Area                | Current implementation                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Wallet              | Freighter through Stellar Wallets Kit, persisted client connection, network checks, balances, and server-verified SEP-53 sessions |
| Merchant profile    | Wallet-authenticated public business metadata stored in the metadata contract; images stored in Cloudinary                        |
| Campaign publishing | Atomic publisher contract calls campaign and metadata contracts before making the campaign public                                 |
| Campaign rules      | Fixed supply, price, service value, expiration, payment split, protection reserve, immutable financial terms after sales start    |
| Purchase            | Customer-authorized Stellar asset transfer, unique pass assignment, payment distribution, event emission, and explorer link       |
| Pass lifecycle      | Active, Redeemed, Expired, and Refunded states; gifting changes ownership without creating another pass                           |
| Redemption          | Branded QR identifies the pass; short-lived sponsored request plus current-owner wallet approval is required                      |
| Refunds             | Deterministic contract-defined eligibility; the UI does not promise a guaranteed full refund                                      |
| Reviews             | Wallet-authorized rating and message stored in the review contract; platform-sponsored fee; public paginated review feed          |
| Activity            | Cursor-based Stellar event ingestion, idempotent indexing, immediate post-transaction reconciliation, and scheduled recovery      |
| Notifications       | Optional Gmail email for purchase, gift, receipt, redemption, expiration, refund, and sold-out events                             |
| Operations          | Sentry, PostHog, Vercel Analytics, Speed Insights, protected cron recovery, and Soroban TTL maintenance                           |

## Architecture

```mermaid
flowchart LR
    MW["Merchant wallet"] --> APP["Next.js application"]
    CW["Customer wallet"] --> APP
    APP --> RPC["Stellar RPC"]
    RPC --> PUB["Publisher contract"]
    PUB --> CAM["Campaign contract"]
    PUB --> META["Metadata contract"]
    APP --> RED["Redemption contract"]
    RED --> CAM
    APP --> REV["Review contract"]
    CAM --> SAC["Configured Stellar Asset Contract"]
    CAM -- "contract events" --> IDX["Idempotent event indexer"]
    META -- "contract events" --> IDX
    RED -- "contract events" --> IDX
    REV -- "contract events" --> IDX
    IDX --> FS["Firestore operational cache"]
    IDX --> MAIL["Gmail notifications"]
    APP --> CLOUD["Cloudinary images"]
    APP --> OBS["Sentry, PostHog, Vercel telemetry"]
```

## Project folder structure

The application is organized by responsibility: Next.js presentation and routing live in `src/app` and `src/components`, domain behavior lives in `src/features`, blockchain access is isolated in `src/lib` and `src/server`, and Soroban source remains independently testable under `contracts`.

### Folder purpose guide

| Path | Purpose |
| --- | --- |
| `.github/` | Dependabot configuration, CI quality gates, and protected Vercel deployment automation |
| `contracts/` | Rust/Soroban contract source, tests, workspace configuration, and locked dependencies |
| `deployments/` | Immutable Testnet contract addresses, source commits, WASM hashes, and transaction evidence |
| `docs/` | Deployment, production-release, and operations runbooks |
| `e2e/` | Playwright critical user journeys |
| `patches/` | pnpm dependency patches required for reproducible installation |
| `public/` | App branding, background media, product screenshots, mobile screenshots, and judge evidence |
| `scripts/` | Deployment, migration, audit, smoke-test, reporting, TTL, and scheduled-operations tools |
| `src/app/` | Next.js pages, layouts, global styles, error boundary, and server API route handlers |
| `src/components/` | Reusable product, dashboard, wallet, form, dialog, review, and layout components with tests |
| `src/features/` | Feature DTOs, validation, browser-side APIs, authorization helpers, and workflows with tests |
| `src/generated/` | TypeScript clients and types generated from the five deployed Soroban contracts |
| `src/lib/` | Shared analytics, styling, Stellar configuration, wallet adapters, and contract clients |
| `src/server/` | Server-only Stellar, Firestore, Cloudinary, email, event, wallet-auth, review, and operations logic |
| `src/test/` | Shared Vitest setup, server-only shim, and test fixtures |
| Root configuration | Environment template, package manifests, tool configuration, security policy, and project documentation |

### Complete file inventory

<details>
<summary>Show the complete tracked project tree</summary>

This inventory contains all **313 project files currently present and not ignored**. Local secrets and generated runtime/build directories such as `.env.local`, `.git/`, `node_modules/`, `.next/`, `contracts/target/`, `playwright-report/`, and `test-results/` are intentionally excluded.

```text
wrenpass/
├── .env.example
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── .gitignore
├── .vercelignore
├── AGENTS.md
├── contracts/
│   ├── Cargo.lock
│   ├── Cargo.toml
│   ├── wrenpass-campaign/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── test.rs
│   ├── wrenpass-metadata/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── test.rs
│   ├── wrenpass-publisher/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── test.rs
│   ├── wrenpass-redemptions/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       └── test.rs
│   └── wrenpass-reviews/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           └── test.rs
├── deployments/
│   └── testnet.json
├── docs/
│   ├── DEPLOYMENT.md
│   ├── OPERATIONS.md
│   └── PRODUCTION.md
├── e2e/
│   └── critical-journeys.spec.ts
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── patches/
│   └── base32.js@0.1.0.patch
├── playwright.config.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── postcss.config.mjs
├── public/
│   ├── bg.mp4
│   ├── ci-cd1.png
│   ├── ci-cd2.png
│   ├── ci-cd3.png
│   ├── ci-cd-code.png
│   ├── logo.png
│   ├── logo-qr.png
│   ├── mobile-view1.png
│   ├── mobile-view2.png
│   ├── mobile-view3.png
│   ├── mobile-view4.png
│   ├── posthog1.png
│   ├── posthog2.png
│   ├── productui1.png
│   ├── productui2.png
│   ├── productui3.png
│   ├── productui4.png
│   ├── sentry1.png
│   ├── sentry2.png
│   ├── sentry3.png
│   ├── Test-output.png
│   └── usersreview.png
├── README.md
├── scripts/
│   ├── audit-offchain-boundary.ts
│   ├── cleanup-expired-wallet-auth.ts
│   ├── deploy-campaign-publisher.ts
│   ├── deploy-contract-suite.ts
│   ├── export-user-wallet-interactions.ts
│   ├── maintain-stellar-ttl.ts
│   ├── migrate-campaign-transaction-index.ts
│   ├── migrate-metadata-profile-index.ts
│   ├── migrate-review-event-index.ts
│   ├── minimize-offchain-pii.ts
│   ├── plan-stellar-ttl.ts
│   ├── run-scheduled-operations.ts
│   ├── smoke-services.ts
│   ├── smoke-stellar.ts
│   └── verify-contract-deployments.ts
├── SECURITY.md
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── campaigns/
│   │   │   │   └── [campaignId]/
│   │   │   │       └── transactions/
│   │   │   │           └── route.ts
│   │   │   ├── cron/
│   │   │   │   └── operations/
│   │   │   │       └── route.ts
│   │   │   ├── customer/
│   │   │   │   ├── activity/
│   │   │   │   │   └── route.ts
│   │   │   │   └── passes/
│   │   │   │       └── route.ts
│   │   │   ├── events/
│   │   │   │   └── sync/
│   │   │   │       └── route.ts
│   │   │   ├── merchant/
│   │   │   │   ├── campaigns/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── images/
│   │   │   │   │   └── route.ts
│   │   │   │   └── profile/
│   │   │   │       └── route.ts
│   │   │   ├── notifications/
│   │   │   │   └── profile/
│   │   │   │       └── route.ts
│   │   │   ├── redemptions/
│   │   │   │   ├── route.ts
│   │   │   │   └── validate/
│   │   │   │       └── route.ts
│   │   │   ├── reviews/
│   │   │   │   ├── route.ts
│   │   │   │   └── sponsor/
│   │   │   │       └── route.ts
│   │   │   ├── stellar/
│   │   │   │   └── balances/
│   │   │   │       └── route.ts
│   │   │   └── wallet/
│   │   │       ├── challenge/
│   │   │       │   └── route.ts
│   │   │       └── session/
│   │   │           └── route.ts
│   │   ├── campaigns/
│   │   │   └── [campaignId]/
│   │   │       ├── loading.test.tsx
│   │   │       ├── loading.tsx
│   │   │       └── page.tsx
│   │   ├── global-error.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── merchant/
│   │   │   ├── business-identity/
│   │   │   │   └── page.tsx
│   │   │   ├── create-campaign/
│   │   │   │   └── page.tsx
│   │   │   ├── page.tsx
│   │   │   └── redeem-pass/
│   │   │       └── page.tsx
│   │   ├── page.tsx
│   │   ├── passes/
│   │   │   └── page.tsx
│   │   └── reviews/
│   │       └── page.tsx
│   ├── components/
│   │   ├── campaigns/
│   │   │   ├── campaign-offer.test.tsx
│   │   │   ├── campaign-offer.tsx
│   │   │   ├── campaign-transactions.test.tsx
│   │   │   └── campaign-transactions.tsx
│   │   ├── customer/
│   │   │   ├── customer-pass-card.tsx
│   │   │   ├── customer-workspace.test.tsx
│   │   │   ├── customer-workspace.tsx
│   │   │   ├── gift-pass-dialog.test.tsx
│   │   │   ├── gift-pass-dialog.tsx
│   │   │   ├── pass-qr-dialog.test.tsx
│   │   │   ├── pass-qr-dialog.tsx
│   │   │   ├── purchase-panel.test.tsx
│   │   │   ├── purchase-panel.tsx
│   │   │   ├── redemption-requests.test.tsx
│   │   │   └── redemption-requests.tsx
│   │   ├── home/
│   │   │   ├── cinematic-landing.test.tsx
│   │   │   ├── cinematic-landing.tsx
│   │   │   └── pass-preview.tsx
│   │   ├── layout/
│   │   │   ├── footer.tsx
│   │   │   ├── logo.test.tsx
│   │   │   ├── logo.tsx
│   │   │   ├── navigation.test.tsx
│   │   │   └── navigation.tsx
│   │   ├── merchant/
│   │   │   ├── campaign-card.tsx
│   │   │   ├── campaign-form.test.tsx
│   │   │   ├── campaign-form.tsx
│   │   │   ├── campaign-table-layout.ts
│   │   │   ├── merchant-page-shell.tsx
│   │   │   ├── merchant-workspace.test.tsx
│   │   │   ├── merchant-workspace.tsx
│   │   │   ├── profile-form.test.tsx
│   │   │   ├── profile-form.tsx
│   │   │   ├── redemption-scanner.test.tsx
│   │   │   └── redemption-scanner.tsx
│   │   ├── notifications/
│   │   │   └── notification-email-form.tsx
│   │   ├── reviews/
│   │   │   ├── recent-reviews.test.tsx
│   │   │   ├── recent-reviews.tsx
│   │   │   ├── review-card.tsx
│   │   │   ├── review-prompt-provider.test.tsx
│   │   │   ├── review-prompt-provider.tsx
│   │   │   ├── reviews-feed.test.tsx
│   │   │   └── reviews-feed.tsx
│   │   ├── ui/
│   │   │   ├── button.test.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── container.tsx
│   │   │   ├── dialog.test.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── feedback-state.tsx
│   │   │   ├── image-upload-field.test.tsx
│   │   │   ├── image-upload-field.tsx
│   │   │   ├── input.test.tsx
│   │   │   ├── input.tsx
│   │   │   └── motion-reveal.tsx
│   │   └── wallet/
│   │       ├── connected-wallet-link.tsx
│   │       ├── wallet-button.tsx
│   │       ├── wallet-provider.test.tsx
│   │       ├── wallet-provider.tsx
│   │       ├── wallet-route-guard.test.tsx
│   │       └── wallet-route-guard.tsx
│   ├── features/
│   │   ├── campaign-transactions/
│   │   │   ├── api.ts
│   │   │   ├── dto.ts
│   │   │   └── updates.ts
│   │   ├── customer/
│   │   │   ├── api.test.ts
│   │   │   ├── api.ts
│   │   │   ├── dto.ts
│   │   │   └── validation.ts
│   │   ├── merchant/
│   │   │   ├── api.test.ts
│   │   │   ├── api.ts
│   │   │   ├── campaign-terms.test.ts
│   │   │   ├── campaign-terms.ts
│   │   │   ├── campaign-workflow.test.ts
│   │   │   ├── campaign-workflow.ts
│   │   │   ├── display.ts
│   │   │   └── dto.ts
│   │   ├── notifications/
│   │   │   ├── api.test.ts
│   │   │   └── api.ts
│   │   ├── redemption/
│   │   │   ├── api.ts
│   │   │   ├── dto.ts
│   │   │   ├── qr.test.ts
│   │   │   ├── qr.ts
│   │   │   └── request-authorization.ts
│   │   └── reviews/
│   │       ├── api.ts
│   │       ├── authorization.ts
│   │       ├── dto.ts
│   │       ├── validation.test.ts
│   │       └── validation.ts
│   ├── generated/
│   │   ├── metadata-contract/
│   │   │   ├── .gitignore
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src/
│   │   │   │   └── index.ts
│   │   │   └── tsconfig.json
│   │   ├── publisher-contract/
│   │   │   ├── .gitignore
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src/
│   │   │   │   └── index.ts
│   │   │   └── tsconfig.json
│   │   ├── redemptions-contract/
│   │   │   ├── .gitignore
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src/
│   │   │   │   └── index.ts
│   │   │   └── tsconfig.json
│   │   ├── reviews-contract/
│   │   │   ├── .gitignore
│   │   │   ├── package.json
│   │   │   ├── README.md
│   │   │   ├── src/
│   │   │   │   └── index.ts
│   │   │   └── tsconfig.json
│   │   └── wrenpass-contract/
│   │       ├── .gitignore
│   │       ├── package.json
│   │       ├── README.md
│   │       ├── src/
│   │       │   └── index.ts
│   │       └── tsconfig.json
│   ├── instrumentation.ts
│   ├── instrumentation-client.ts
│   ├── lib/
│   │   ├── analytics.test.ts
│   │   ├── analytics.ts
│   │   ├── cn.ts
│   │   └── stellar/
│   │       ├── config.test.ts
│   │       ├── config.ts
│   │       ├── explorer.ts
│   │       ├── freighter-adapter.ts
│   │       ├── metadata-client.test.ts
│   │       ├── metadata-client.ts
│   │       ├── publisher-client.ts
│   │       ├── redemption-request-client.test.ts
│   │       ├── redemption-request-client.ts
│   │       ├── reviews-client.test.ts
│   │       ├── reviews-client.ts
│   │       ├── transaction-submission.test.ts
│   │       ├── transaction-submission.ts
│   │       └── wrenpass-client.ts
│   ├── sentry.edge.config.ts
│   ├── sentry.server.config.ts
│   ├── server/
│   │   ├── campaign-transactions/
│   │   │   ├── campaign-event-key.ts
│   │   │   ├── campaign-transaction-index.test.ts
│   │   │   ├── campaign-transaction-index.ts
│   │   │   └── service.ts
│   │   ├── cloudinary/
│   │   │   ├── image-service.test.ts
│   │   │   └── image-service.ts
│   │   ├── customer/
│   │   │   ├── customer-service.test.ts
│   │   │   ├── customer-service.ts
│   │   │   └── service.ts
│   │   ├── email/
│   │   │   ├── email-service.test.ts
│   │   │   └── email-service.ts
│   │   ├── env.test.ts
│   │   ├── env.ts
│   │   ├── events/
│   │   │   ├── event-source.ts
│   │   │   ├── event-sync-service.test.ts
│   │   │   ├── event-sync-service.ts
│   │   │   ├── firestore-notification-claim-store.ts
│   │   │   └── service.ts
│   │   ├── firestore/
│   │   │   ├── document-store.ts
│   │   │   ├── firebase-admin.ts
│   │   │   ├── repositories.test.ts
│   │   │   └── repositories.ts
│   │   ├── merchant/
│   │   │   ├── merchant-service.test.ts
│   │   │   ├── merchant-service.ts
│   │   │   ├── metadata-registry-reader.ts
│   │   │   ├── profile-event-index.test.ts
│   │   │   ├── profile-event-index.ts
│   │   │   ├── profile-event-source.ts
│   │   │   └── service.ts
│   │   ├── models.ts
│   │   ├── operations/
│   │   │   ├── cron-auth.test.ts
│   │   │   ├── cron-auth.ts
│   │   │   ├── operational-state-store.test.ts
│   │   │   ├── operational-state-store.ts
│   │   │   ├── operations-service.test.ts
│   │   │   ├── operations-service.ts
│   │   │   ├── ttl-maintenance-service.test.ts
│   │   │   └── ttl-maintenance-service.ts
│   │   ├── redemption/
│   │   │   ├── redemption-registry.test.ts
│   │   │   ├── redemption-registry.ts
│   │   │   ├── redemption-service.test.ts
│   │   │   ├── redemption-service.ts
│   │   │   └── service.ts
│   │   ├── reviews/
│   │   │   ├── reader-service.ts
│   │   │   ├── review-event-index.test.ts
│   │   │   ├── review-event-index.ts
│   │   │   ├── review-event-source.ts
│   │   │   ├── review-reader.test.ts
│   │   │   ├── review-reader.ts
│   │   │   ├── review-sponsor-guard.test.ts
│   │   │   ├── review-sponsor-guard.ts
│   │   │   ├── review-sponsorship-service.test.ts
│   │   │   ├── review-sponsorship-service.ts
│   │   │   └── service.ts
│   │   ├── stellar/
│   │   │   ├── balance-service.test.ts
│   │   │   ├── balance-service.ts
│   │   │   ├── campaign-reader.ts
│   │   │   ├── customer-chain-reader.test.ts
│   │   │   ├── customer-chain-reader.ts
│   │   │   ├── event-retention.test.ts
│   │   │   ├── event-retention.ts
│   │   │   ├── purchase-readiness.test.ts
│   │   │   ├── purchase-readiness.ts
│   │   │   ├── rpc-gateway.ts
│   │   │   ├── services.ts
│   │   │   ├── ttl-service.test.ts
│   │   │   └── ttl-service.ts
│   │   └── wallet-auth/
│   │       ├── auth-service.test.ts
│   │       ├── auth-service.ts
│   │       ├── firestore-auth-store.test.ts
│   │       ├── firestore-auth-store.ts
│   │       ├── request-session.ts
│   │       └── service.ts
│   └── test/
│       ├── fixtures/
│       │   └── customer.ts
│       ├── server-only.ts
│       └── setup.ts
├── tsconfig.json
├── vercel.json
└── vitest.config.ts
```

</details>

### Source of truth

| On-chain and authoritative                        | Off-chain and operational                        |
| ------------------------------------------------- | ------------------------------------------------ |
| Campaign financial configuration and status       | Opaque wallet challenges and sessions            |
| Fixed supply, sold count, and redeemed count      | Idempotent event index and recovery cursor       |
| Pass IDs, owners, and lifecycle states            | Notification delivery records                    |
| Stellar asset settlement and protection reserve   | Optional notification email setting              |
| Public merchant profile and campaign descriptions | Cloudinary provider-management references        |
| Pending owner-approved redemption requests        | Leases, rate limits, and operational checkpoints |
| Review wallet, rating, and message                | Monitoring and privacy-safe analytics            |

Firestore is never treated as the authority for balances, payments, pass ownership, supply, or redemption. If indexing or email delivery is unavailable, the on-chain state remains valid.

### Security boundaries

- Server actions use a signed SEP-53 challenge and an opaque HTTP session. A client-provided wallet address is never enough.
- Merchant, customer, pass-owner, and reviewer actions require the correct wallet authorization in the contracts.
- The campaign contract reads its own integer-safe financial configuration. It does not trust client-calculated payment values.
- Basis points and integer asset units avoid JavaScript floating-point financial calculations.
- The QR contains pass identity only. The current owner must authorize redemption.
- Sponsored review and redemption transactions still require the user's contract authorization.
- Firebase Admin, Cloudinary secrets, Gmail credentials, sponsor keys, and monitoring tokens stay on the server.
- PostHog uses an event allowlist and excludes wallet addresses, emails, transaction hashes, review text, and financial values.
- Sentry removes request bodies, headers, cookies, query strings, and default personal information.

See [SECURITY.md](SECURITY.md) for the complete trust model.

## Soroban contracts

The repository contains five focused Rust contracts in the [contracts](contracts) workspace.

| Contract                                                      | Responsibility                                                                                                                                           | Inter-contract work                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Campaign](contracts/wrenpass-campaign/src/lib.rs)            | Campaign configuration, fixed supply, Stellar asset payment split, pass ownership, gift, redeem, refund, cancellation, storage TTL, and lifecycle events | Uses the configured Stellar Asset Contract token client                               |
| [Metadata](contracts/wrenpass-metadata/src/lib.rs)            | Authoritative merchant profile and campaign text metadata                                                                                                | Calls `get_campaign` to verify the campaign and merchant before metadata registration |
| [Campaign publisher](contracts/wrenpass-publisher/src/lib.rs) | One merchant-authorized transaction creates the campaign, registers metadata, and publishes it                                                           | Calls campaign and metadata contracts atomically                                      |
| [Redemptions](contracts/wrenpass-redemptions/src/lib.rs)      | Short-lived, platform-sponsored redemption request and owner approval state                                                                              | Calls the campaign contract to validate pass and campaign data                        |
| [Reviews](contracts/wrenpass-reviews/src/lib.rs)              | Stores reviewer wallet, 1-5 rating, message, timestamp, and events                                                                                       | Accepts reviewer authorization while the platform sponsors the transaction fee        |

The campaign contract emits meaningful events for campaign creation and status, purchase, gift, redemption, refund, and cancellation. Other contracts emit profile, metadata, redemption-request, and review events. The indexer derives sold-out notifications from the authoritative campaign state after a purchase.

## Testnet deployment proof

Network: **Stellar Testnet**<br />
RPC: `https://soroban-testnet.stellar.org`<br />
Deployment manifest: [deployments/testnet.json](deployments/testnet.json)

Configured Testnet payment asset:

| Code                   | Issuer                                                                                                                                                                 | Stellar Asset Contract                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USDC` (Testnet label) | [`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`](https://stellar.expert/explorer/testnet/account/GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5) | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

This is a configured Testnet asset, not Circle mainnet USDC.

| Contract           | Testnet address                                                                                                                                                         | Deployed WASM SHA-256                                              | Deployment transaction                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign           | [`CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D`](https://stellar.expert/explorer/testnet/contract/CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D) | `aeec070bd69017b5201f25317908e3bdd9349971a7c8cf39ff9d1f1095c1ff33` | Historical hash not retained; WASM verified                                                                                                                                       |
| Metadata           | [`CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR`](https://stellar.expert/explorer/testnet/contract/CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR) | `56ff566c2f2732deb02d690ec5e68316cc12b73f8a4a2fafc53840685c976e97` | Historical hash not retained; WASM verified                                                                                                                                       |
| Campaign publisher | [`CALEYUTH2ZJOU3DXREQG5IGGZ3JWIRUS6P6OT6F25ER5IGTXVSAL5JXS`](https://stellar.expert/explorer/testnet/contract/CALEYUTH2ZJOU3DXREQG5IGGZ3JWIRUS6P6OT6F25ER5IGTXVSAL5JXS) | `4a1183fecc93e185b5a917e6ddf675715765e7311951cdbb48259597cc290342` | [`86d607741f55f09204e5ac0b5c0306886c5c1c927909cf0ba5faf92c006d3db9`](https://stellar.expert/explorer/testnet/tx/86d607741f55f09204e5ac0b5c0306886c5c1c927909cf0ba5faf92c006d3db9) |
| Redemptions        | [`CB6HZLQJGSZBN6NCII2KGOHIQUSG33YQCM7XWGTUK6JTJ4HLSKY65QHN`](https://stellar.expert/explorer/testnet/contract/CB6HZLQJGSZBN6NCII2KGOHIQUSG33YQCM7XWGTUK6JTJ4HLSKY65QHN) | `3e7e47cc108d6376079b0453e1499248a84f7f09fde3e769df32a8e9f2c36c40` | Historical hash not retained; WASM verified                                                                                                                                       |
| Reviews            | [`CCZ7KC6SGTFJKOPVUFD6WYNBSYGOCHBUNV5HNR2AVGFP23KBOOMF6WY3`](https://stellar.expert/explorer/testnet/contract/CCZ7KC6SGTFJKOPVUFD6WYNBSYGOCHBUNV5HNR2AVGFP23KBOOMF6WY3) | `b0605d6e1da7fcb1229aa18a25ddd22ded196058945bc26577a145ab2fcb427c` | Historical hash not retained; WASM verified                                                                                                                                       |

Four early deployment transaction hashes were not retained. This limitation is recorded in the manifest instead of being hidden. Each contract entry pins its exact historical source commit, toolchain, contract address, and WASM hash. The CI provenance job rebuilds the historical source and checks the installed Testnet WASM:

```bash
pnpm contract:verify:testnet
```

### Selected-wallet transaction proof

The transaction records below are restricted to the 55 wallet addresses listed in the [User Feedback Spreadsheet](https://docs.google.com/spreadsheets/d/1yemfWq2ck5gLixD1YWBz11nuzsmo38dh6v7O0RAebDw/edit?usp=sharing) and cross-referenced against the retained wallet-interaction export. The ledger, transaction hash, event type, wallet role, and explorer link are taken directly from the report.


## Proof of 10+ user wallets

The retained wallet-interaction export was generated from indexed application data on **2026-08-20 at 16:14:23.229 UTC**. The proof below is intentionally limited to the **55 unique wallet addresses present in the User Feedback Spreadsheet**. All 55 addresses matched the retained records. No wallet outside the spreadsheet is included in these proof tables.

### Snapshot totals

| Metric                                           | Result |
| ------------------------------------------------ | -----: |
| Feedback rows in the spreadsheet                | **55** |
| Unique spreadsheet wallet addresses              | **55** |
| Addresses matched in retained records            | **55** |
| On-chain records attributed to selected wallets | **168** |
| Unique transaction hashes in selected records    | **168** |

The selected records are an evidence slice, not a claim about unique human identities. A wallet address proves a distinct Stellar account, while the ledger, event type, transaction hash, and explorer link prove the recorded on-chain interaction.

### Event distribution

| Event type             | Selected records |
| ---------------------- | ---------------: |
| `pass_purchased`       |              149 |
| `review_submitted`     |                9 |
| `merchant_profile_set` |                4 |
| `pass_redeemed`        |                3 |
| `pass_gifted`          |                2 |
| `campaign_sold_out`    |                1 |
| **Total**              |          **168** |

### Selected-wallet records

The table below shows one latest transaction proof per spreadsheet wallet. The selected-wallet slice contains 168 indexed records in total.

| ID | Wallet address | Records | Event types | Roles | Latest transaction | Ledger | Indexed at (UTC) |
| -- | -------------- | ------: | ----------- | ----- | ------------------ | -----: | ---------------- |
| F01 | `GA27SB63Y3TKTUOW3GBE7BF6ZU6NOCPX6PSO3TCNBVOCDUYQQ7O2GD2H` | 2 | `review_submitted`, `pass_purchased` | reviewer, customer | [`faa00e0de414f3f50dffb3ed4013c711c5bf00bb538d777337e1e178869db044`](https://stellar.expert/explorer/testnet/tx/faa00e0de414f3f50dffb3ed4013c711c5bf00bb538d777337e1e178869db044) | 4,097,490 | 2026-08-12T04:23:03.633Z |
| F02 | `GA2LG25AK4TPIZH7S2LVVIOYRTNTQRLOXEDZEKPWBRL66NQESSPZQVRZ` | 1 | `pass_purchased` | customer | [`5775f36193f609438aa2821983c4470d19a6437c054d09c7d56083df37976034`](https://stellar.expert/explorer/testnet/tx/5775f36193f609438aa2821983c4470d19a6437c054d09c7d56083df37976034) | 4,048,437 | 2026-08-09T10:38:52.635Z |
| F03 | `GA3JG3JUDRLVU47QW7IBQVRGTZPK5PCCWF544NOW55643EZ6YJEUAZ3A` | 5 | `pass_purchased` | customer | [`4b45348f4ab7dfb46dfc251734bb2f51eef0a0407ed1de1d59f54743ea2856c1`](https://stellar.expert/explorer/testnet/tx/4b45348f4ab7dfb46dfc251734bb2f51eef0a0407ed1de1d59f54743ea2856c1) | 4,214,391 | 2026-08-18T23:01:01.721Z |
| F04 | `GA5GX6HXCZVXWJ6W5ZEQSLH5FCLGDBYOGJMYO5B3SMJBF5YXDD3MYL3W` | 1 | `pass_gifted` | recipient | [`98e3e38c78899a3f03b3c6e7472cae1d030247e07d88071927695ec0a1d45adf`](https://stellar.expert/explorer/testnet/tx/98e3e38c78899a3f03b3c6e7472cae1d030247e07d88071927695ec0a1d45adf) | 4,098,213 | 2026-08-12T05:23:26.982Z |
| F05 | `GA5P65P3SDKNH7OV6WBRGL2EOM7MABZC6VDS6BQRPNH4K6HBGVCKCD2O` | 3 | `merchant_profile_set`, `review_submitted`, `pass_purchased` | merchant, reviewer, customer | [`ae1cfc7f2fd0b3c96aa14e7aedc8224d352cd63a64a3ced9f2d756765d730d9a`](https://stellar.expert/explorer/testnet/tx/ae1cfc7f2fd0b3c96aa14e7aedc8224d352cd63a64a3ced9f2d756765d730d9a) | 4,069,034 | 2026-08-10T12:48:05Z |
| F06 | `GA7DOCJGV27UMWEKVE57Q6K5ULS3KVNOXPLI7INZKQUQOAH7U5Z2ZWJN` | 1 | `pass_purchased` | customer | [`68b3354608ed7b65042f2eba7de058b4f21c6b385327626f05d15c06404161e6`](https://stellar.expert/explorer/testnet/tx/68b3354608ed7b65042f2eba7de058b4f21c6b385327626f05d15c06404161e6) | 4,203,607 | 2026-08-18T08:00:43.367Z |
| F07 | `GA7HK7OMIGJ5TH24FFPDPXRLDML32D3P7ZAWUY2MK3VEVVT5J2NUU52A` | 4 | `pass_purchased` | customer | [`ad43cfb9e321e4f4653853c35bc68df2ad10fcd608db0917a2fb3a01f9cd417c`](https://stellar.expert/explorer/testnet/tx/ad43cfb9e321e4f4653853c35bc68df2ad10fcd608db0917a2fb3a01f9cd417c) | 4,207,204 | 2026-08-18T13:01:00.862Z |
| F08 | `GA7ZKQR5OWGHY4YGE36SMKSDZ5DZ7U37JJFOYKKAUVQKIW5U5XP5QMKM` | 3 | `pass_purchased` | customer | [`64d0dba5968a48425b38b753f88ae1bc24fe9784cffdb4f68101f3aa25afdaaf`](https://stellar.expert/explorer/testnet/tx/64d0dba5968a48425b38b753f88ae1bc24fe9784cffdb4f68101f3aa25afdaaf) | 4,187,797 | 2026-08-17T10:00:52.444Z |
| F09 | `GADRDDWDRMVMA3UBOSZAA5NYPO6RPH6NRYMA5SCGDE33E7NC46P7KGDO` | 5 | `campaign_sold_out`, `review_submitted`, `pass_redeemed`, `merchant_profile_set` | merchant, reviewer | [`a7158e5bf0cb4a5bcbd8634ba1b109514bf6665d974ae33cccb1326d226216dc`](https://stellar.expert/explorer/testnet/tx/a7158e5bf0cb4a5bcbd8634ba1b109514bf6665d974ae33cccb1326d226216dc) | 4,220,856 | 2026-08-19T08:00:43.038Z |
| F10 | `GADV6LABZNF5D5OEJG3XVDUQOBU65F6RFXWB67JMHHIFOO2DYGMI6ZTN` | 4 | `pass_purchased` | customer | [`0c415815ddce5012768ff51abec0aef3526cdd135c4226a225ea0e3f0760152e`](https://stellar.expert/explorer/testnet/tx/0c415815ddce5012768ff51abec0aef3526cdd135c4226a225ea0e3f0760152e) | 4,188,517 | 2026-08-17T11:01:01.294Z |
| F11 | `GAHHDZG43GGJP4PKVDW5HSQ6SXBWE2GVNGZBS2VSKB57ECVLDDC2LZAV` | 2 | `pass_purchased` | customer | [`177bcf79f41bdd51b3b28f89cf047b1a6c1a92cdba7ab20b3d9ce983b94c6577`](https://stellar.expert/explorer/testnet/tx/177bcf79f41bdd51b3b28f89cf047b1a6c1a92cdba7ab20b3d9ce983b94c6577) | 4,190,671 | 2026-08-17T14:00:47.701Z |
| F12 | `GAICCFDP3RZL4525WQPBZXAALK7IWVO6GGGBMCC5WOP3XPCHXEZCUGYQ` | 4 | `pass_purchased` | customer | [`c39761d9bd434d4602e922d3cde8256ce696aa8a056581e67d0efe8245ed0d4f`](https://stellar.expert/explorer/testnet/tx/c39761d9bd434d4602e922d3cde8256ce696aa8a056581e67d0efe8245ed0d4f) | 4,216,546 | 2026-08-19T02:00:57.433Z |
| F13 | `GAJNULBCAFETHTFEWNNH7HQCTPKQCU6MNATFOEUL73OPIBJYTSHMBAOT` | 5 | `pass_purchased` | customer | [`9dfcf86379b61ae9c225e4d73cae7c7321a9a5de4b35d61f930fa350a49cb79f`](https://stellar.expert/explorer/testnet/tx/9dfcf86379b61ae9c225e4d73cae7c7321a9a5de4b35d61f930fa350a49cb79f) | 4,212,954 | 2026-08-18T21:01:04.857Z |
| F14 | `GALWPGAEEXXVIVAUSUQOSMK7WT4RUHCRO5SQBDFFY64PYPH73EBWUPRG` | 4 | `pass_purchased` | customer | [`a1ec35feecf1a7aca579d0269be469a02551c358b0c9e036b5204f55f8c2143d`](https://stellar.expert/explorer/testnet/tx/a1ec35feecf1a7aca579d0269be469a02551c358b0c9e036b5204f55f8c2143d) | 4,220,140 | 2026-08-19T07:00:58.066Z |
| F15 | `GANKMXSQAFUGRWQDP42XZSCNLXS5TIWEUGWLVUDX3MPLXLUIZD3S7EOF` | 2 | `pass_purchased` | customer | [`13b42c6308162ec8589379f1b9523b6565314312392a5616ebbd0a0d9df5d701`](https://stellar.expert/explorer/testnet/tx/13b42c6308162ec8589379f1b9523b6565314312392a5616ebbd0a0d9df5d701) | 4,200,015 | 2026-08-18T03:00:51.982Z |
| F16 | `GAP3MYHSNECETWVLG775LRIB6KPHEMDAIWJSSQQR4KQ7UQHJXPGFUORY` | 4 | `pass_purchased` | customer | [`f3b50e4a8823ac16de683339cf61f858f23a8221a585965f738243175f33cf01`](https://stellar.expert/explorer/testnet/tx/f3b50e4a8823ac16de683339cf61f858f23a8221a585965f738243175f33cf01) | 4,189,236 | 2026-08-17T12:01:02.012Z |
| F17 | `GAPOE53VOR5STKO6HVPJ6B4DQKGX5DCEL2DTGFJ2Z73YTZCTFRVO4OSO` | 5 | `pass_purchased` | customer | [`bef00219b5fa54fb3f0856850410a8ba5606b58ecf42d5e20d62ca4f2c86c5f7`](https://stellar.expert/explorer/testnet/tx/bef00219b5fa54fb3f0856850410a8ba5606b58ecf42d5e20d62ca4f2c86c5f7) | 4,211,517 | 2026-08-18T19:01:04.947Z |
| F18 | `GAV5YXNQ5LD3SRTCHMXVYWS7BVHE5ZTZODZF2DOQA7F2J2IARWB5BL6D` | 3 | `pass_purchased` | customer | [`fcbe6b15a812c5ce56a4ba4f4a6cd7640f575df31fdf03bc14c2708430908f88`](https://stellar.expert/explorer/testnet/tx/fcbe6b15a812c5ce56a4ba4f4a6cd7640f575df31fdf03bc14c2708430908f88) | 4,099,810 | 2026-08-12T07:36:42.991Z |
| F19 | `GAYQMQUQNZJA263Y5IPY5ONZPN5ZIHQXTDZWPM4AALLBWV6MQARX6HET` | 3 | `pass_purchased` | customer | [`09686f50f19579a0721be84839e1545a4e5059e93f5bf419d8689b0c8efc94d6`](https://stellar.expert/explorer/testnet/tx/09686f50f19579a0721be84839e1545a4e5059e93f5bf419d8689b0c8efc94d6) | 4,160,480 | 2026-08-15T20:00:48.764Z |
| F20 | `GB355UEQEGF357CWQRE6W5CW4OUKCUX7AQ7UMDLX4MDFRDMKNZ3VWROV` | 3 | `pass_purchased` | customer | [`16e161c1d07992eec400e6dd2029c2cc7d467e46861e196bb6f75e625fa110f4`](https://stellar.expert/explorer/testnet/tx/16e161c1d07992eec400e6dd2029c2cc7d467e46861e196bb6f75e625fa110f4) | 4,205,046 | 2026-08-18T10:00:51.107Z |
| F21 | `GB3GLRPPHF4UFPMPPRIDYS5MOICK2YIZY6TPD462UMHQK7HHFAIEUZEE` | 2 | `pass_purchased` | customer | [`a831255f37cdd0c2006df689ed793c2fdfa284f1ff6a00be41165464ee18ce95`](https://stellar.expert/explorer/testnet/tx/a831255f37cdd0c2006df689ed793c2fdfa284f1ff6a00be41165464ee18ce95) | 4,204,326 | 2026-08-18T09:00:43.782Z |
| F22 | `GB3QLNMDUNRW25PLGNRKWSP4FYQG2WXKNJ6NLOLQ4P6TAHNP2UV3SY3D` | 4 | `pass_purchased` | customer | [`dfb926dedad54c370c84d18596436b7ffb4722b74a780fe70b4fd6452c953417`](https://stellar.expert/explorer/testnet/tx/dfb926dedad54c370c84d18596436b7ffb4722b74a780fe70b4fd6452c953417) | 4,195,703 | 2026-08-17T21:00:58.141Z |
| F23 | `GB4O4CGUDUQVLSUP3NEMFUE5XJW2L6I33LKW2QNC4DP3SNB67BUAS54T` | 1 | `pass_purchased` | customer | [`f19357e5ba80a533a46c98e380ce16f1c6ebcddaade15ea1e6e35a04969e7ed7`](https://stellar.expert/explorer/testnet/tx/f19357e5ba80a533a46c98e380ce16f1c6ebcddaade15ea1e6e35a04969e7ed7) | 4,206,482 | 2026-08-18T12:00:41.778Z |
| F24 | `GB4ZUAQLKB7PCKMVKKY2FJ7UCMPKM3V26ZMCZH23HINZD3Y47J7IQVX4` | 2 | `pass_purchased` | customer | [`b4ea193cdae79847cddbb89f52051beab00fc12e5f9f4adfa13b4f1292eb32ec`](https://stellar.expert/explorer/testnet/tx/b4ea193cdae79847cddbb89f52051beab00fc12e5f9f4adfa13b4f1292eb32ec) | 4,187,077 | 2026-08-17T09:00:46.269Z |
| F25 | `GB7MYTL7BAX6UHMFAVYO4KXALYIZDJNAIICLWUGXWR2DUATVFTMSPMH4` | 2 | `pass_purchased` | customer | [`d6801e5f438130aaf37ad09f47fa35d15ea2d5c60900570f9b2550d91be04377`](https://stellar.expert/explorer/testnet/tx/d6801e5f438130aaf37ad09f47fa35d15ea2d5c60900570f9b2550d91be04377) | 4,185,639 | 2026-08-17T07:00:43.878Z |
| F26 | `GBC62OALEZZJEPSCYICXEEA4VBSMEHQEUTOG62BEPQUXRVVIXQCJBNOL` | 1 | `pass_purchased` | customer | [`9023216abf8eced92e022c16d45df24e0e598cb00e0fffe372ddb3b215866c2b`](https://stellar.expert/explorer/testnet/tx/9023216abf8eced92e022c16d45df24e0e598cb00e0fffe372ddb3b215866c2b) | 4,192,826 | 2026-08-17T17:00:41.095Z |
| F27 | `GBFV2UEO4NH3U4EOYGKIA6O7UTLTILEWC7IWCQ2PPCG54TORNZMOGCHQ` | 3 | `pass_purchased` | customer | [`d81200922e52601b1acf0e6c97a6c82dcc00619f36066a00c8439936c4d19a32`](https://stellar.expert/explorer/testnet/tx/d81200922e52601b1acf0e6c97a6c82dcc00619f36066a00c8439936c4d19a32) | 4,210,796 | 2026-08-18T18:00:52.146Z |
| F28 | `GBGRE5RFLIU2FWAQEFOXGBPQXDWAZ575CNS2XSYITKMKQJ7B5SWU6LPY` | 5 | `pass_purchased` | customer | [`4b20aeb7404bb57d1611d58705c30e14c44d97db45935fca569644a4632f840a`](https://stellar.expert/explorer/testnet/tx/4b20aeb7404bb57d1611d58705c30e14c44d97db45935fca569644a4632f840a) | 4,192,111 | 2026-08-17T16:01:06.015Z |
| F29 | `GBLN5TZFGRKCEPW5VQZCAFZL7H3CQHYKYHFVWVE2P3ZSFUSUQVND635Q` | 3 | `pass_purchased` | customer | [`a62927a6a44f2861a80d14562cfaefa4051a64834329a951e8ef6191ffe483a2`](https://stellar.expert/explorer/testnet/tx/a62927a6a44f2861a80d14562cfaefa4051a64834329a951e8ef6191ffe483a2) | 4,217,263 | 2026-08-19T03:00:50.589Z |
| F30 | `GBLP26JI5VQTAP3AKGSJCFKQ57EPDM5PQOL2W6F4PMLRBHV6PRNHPGUO` | 3 | `pass_purchased` | customer | [`c3b5b2cbe309f3113a95f449b55ce0b00a1fbcb349e55b3096d56e9c25ded15b`](https://stellar.expert/explorer/testnet/tx/c3b5b2cbe309f3113a95f449b55ce0b00a1fbcb349e55b3096d56e9c25ded15b) | 4,175,577 | 2026-08-16T17:00:53.316Z |
| F31 | `GBLYXTXRCTOA5C2FN4GDHGUPEBFFAHZVA46HB6NYJMHCL3GWMPKBPL3D` | 2 | `pass_redeemed`, `review_submitted` | merchant, reviewer | [`0ec788cf7928f7a2b16386a668290f46ba64833d9deab473c28b72ba2d6bb39c`](https://stellar.expert/explorer/testnet/tx/0ec788cf7928f7a2b16386a668290f46ba64833d9deab473c28b72ba2d6bb39c) | 4,098,289 | 2026-08-12T05:29:48.331Z |
| F32 | `GBMWJ2TASMVV3Q4IXHICCQE3CP7XPJ3TW45GRNTR23WEST7FHQH6233E` | 2 | `pass_purchased` | customer | [`177818e53cd87419b3b779ea60dcb35866a769fd3d9db55e5f337a7df802e611`](https://stellar.expert/explorer/testnet/tx/177818e53cd87419b3b779ea60dcb35866a769fd3d9db55e5f337a7df802e611) | 4,194,983 | 2026-08-17T20:00:46.595Z |
| F33 | `GBMXI272OMUS35SH7ZOBDRCJBE7UR3Y6LRGU5ZPPAHPHYZR5YD5URMNB` | 5 | `pass_purchased` | customer | [`1bafe1c0a96dda2b28f2a9ce803050587534168417738cd4d0339f43cc5a9e64`](https://stellar.expert/explorer/testnet/tx/1bafe1c0a96dda2b28f2a9ce803050587534168417738cd4d0339f43cc5a9e64) | 4,186,361 | 2026-08-17T08:01:02.479Z |
| F34 | `GBRQMPB42EBA6YFU7HG23EKPA34WVZX5LQJZND6BEQNBN3XB27KXQ64F` | 2 | `pass_purchased` | customer | [`da39f1499fda36b2d4df51164b8f3f2855bc284c6ce2fd84e5e16d4d72538c30`](https://stellar.expert/explorer/testnet/tx/da39f1499fda36b2d4df51164b8f3f2855bc284c6ce2fd84e5e16d4d72538c30) | 4,184,860 | 2026-08-17T05:55:43.566Z |
| F35 | `GBSS4U7TU3J7LMZOZQJRVQVLO3RMRZTMY4FO5MLQ664TLO6FH7SS4IOD` | 4 | `pass_purchased` | customer | [`871fb3ebe75eb3bcf6cce8a599d903b42eac755ff1b763666f5556bdbcf5f76c`](https://stellar.expert/explorer/testnet/tx/871fb3ebe75eb3bcf6cce8a599d903b42eac755ff1b763666f5556bdbcf5f76c) | 4,215,827 | 2026-08-19T01:00:55.656Z |
| F36 | `GBTKKJENSXOMXDOCELCSYD2UZZG43GPAECJBO5VSVO5EP5K7PX2ZS532` | 1 | `pass_purchased` | customer | [`01e86d2888a20811aca4e3f741c06372992128e00d2a8e25da5ab8f46564963f`](https://stellar.expert/explorer/testnet/tx/01e86d2888a20811aca4e3f741c06372992128e00d2a8e25da5ab8f46564963f) | 4,221,575 | 2026-08-19T09:00:43.492Z |
| F37 | `GBTLEMZD5H2YDQUUU3JBE4A6M45LK6MYDKJQPDAFJHXDWKWJA3SBAB2P` | 5 | `pass_purchased` | customer | [`2769fe80f66bb569352b08e07cf119cf960857b5fe25e5eae46dcba71b621b43`](https://stellar.expert/explorer/testnet/tx/2769fe80f66bb569352b08e07cf119cf960857b5fe25e5eae46dcba71b621b43) | 4,202,173 | 2026-08-18T06:01:02.375Z |
| F38 | `GBUD76AMSLT56RSPIHL6JN3RRNBBICCLGFRLN6GQMQHXTCPT4QJEFUXD` | 2 | `pass_purchased` | customer | [`8ef303e06d6a184636cea5c5efdede3cc66fc4b0383c2bb34374178a25909815`](https://stellar.expert/explorer/testnet/tx/8ef303e06d6a184636cea5c5efdede3cc66fc4b0383c2bb34374178a25909815) | 4,156,674 | 2026-08-15T14:43:07.955Z |
| F39 | `GC2UJWR2IQD2PXKCBUTSDWRRTLDU647ZIHD3QC6MAXEM2QICNI5WFAMX` | 5 | `pass_purchased` | customer | [`df4660876fa1c6fc1658c08729f776c8b45eb07cbbe2233a5d4c5a255755c045`](https://stellar.expert/explorer/testnet/tx/df4660876fa1c6fc1658c08729f776c8b45eb07cbbe2233a5d4c5a255755c045) | 4,217,984 | 2026-08-19T04:01:03.232Z |
| F40 | `GC4JCVLELIGUHGYJM2EAEXDYIN7XUW4V4YBYWADVZHNIBIRIK4MFJJKU` | 2 | `pass_purchased` | customer | [`1e459bf1fb1a04e56dfdb08c55515a7af54e8c95c95d8b7fc211a48694e78c89`](https://stellar.expert/explorer/testnet/tx/1e459bf1fb1a04e56dfdb08c55515a7af54e8c95c95d8b7fc211a48694e78c89) | 4,209,358 | 2026-08-18T16:00:49.362Z |
| F41 | `GC4KKRIEUTM6W7ZF6LKPVMVJY2ICV5VCAQTEQCJN4Y6HPFFDBRBJOV5C` | 3 | `pass_purchased` | customer | [`5223cbb167abeb4776b80b3ab3fda01117c2c17019ff329fddbbb66a0ef6454b`](https://stellar.expert/explorer/testnet/tx/5223cbb167abeb4776b80b3ab3fda01117c2c17019ff329fddbbb66a0ef6454b) | 4,194,266 | 2026-08-17T19:00:56.573Z |
| F42 | `GC4LXTPHSIV2UQWTQACO7ZHJRQA4KJLIPOJ2NJTNYRMKIILZV3RYNQJH` | 8 | `review_submitted`, `pass_purchased`, `merchant_profile_set`, `pass_gifted` | reviewer, customer, merchant, recipient | [`922e6d0d608278cf6296dfe3d203fe14859f334d7ac66acb90205cbe3fc6e3ff`](https://stellar.expert/explorer/testnet/tx/922e6d0d608278cf6296dfe3d203fe14859f334d7ac66acb90205cbe3fc6e3ff) | 4,069,765 | 2026-08-10T13:49:05Z |
| F43 | `GC4XITFXXRNTNBPRBYRBLTT3U65V3DMHW6ZXKELJVV3T66RZKPHPQTNN` | 3 | `pass_purchased` | customer | [`4194d6443bdac971c05207bc097c922139cc9831d9973de6cd7e00f1f1775f72`](https://stellar.expert/explorer/testnet/tx/4194d6443bdac971c05207bc097c922139cc9831d9973de6cd7e00f1f1775f72) | 4,191,391 | 2026-08-17T15:00:55.576Z |
| F44 | `GC5YNAOL552S5DB6WJ3SMYOTEWVNV3TILNOO3OGLJFSOCNWMITAZFJG4` | 3 | `pass_purchased` | customer | [`48d6c12fe19248c6db944689270b818db602a6c07aa27760d7f72410599e33f2`](https://stellar.expert/explorer/testnet/tx/48d6c12fe19248c6db944689270b818db602a6c07aa27760d7f72410599e33f2) | 4,222,296 | 2026-08-19T10:00:55.982Z |
| F45 | `GCJ2GCHZ44QNFR4NAQCDUXDOEN5KBUEO4XAP44JOOOX5FX4LXCGNCE7S` | 4 | `pass_purchased` | customer | [`c436bb1ac6b003348d28959f84064268747bc5e7d53df5c5ab2cf5c570dfd9ca`](https://stellar.expert/explorer/testnet/tx/c436bb1ac6b003348d28959f84064268747bc5e7d53df5c5ab2cf5c570dfd9ca) | 4,198,578 | 2026-08-18T01:00:55.794Z |
| F46 | `GCLDZG7HON2PJBSY3JEA5SOUQLNLCHUT4NYTDI7ITKSUDH65E2JOTCA2` | 3 | `pass_purchased` | customer | [`8b64b651677e8495bf793802ad0fe0e84c8047446ccaa5b1ce4f7b33b34d5229`](https://stellar.expert/explorer/testnet/tx/8b64b651677e8495bf793802ad0fe0e84c8047446ccaa5b1ce4f7b33b34d5229) | 4,199,296 | 2026-08-18T02:00:51.646Z |
| F47 | `GCLNGNJ2SJOJ7Z2C6YSXOJUXEJIZ5DZ3Y77WCZ5EELC6ZLOVBX744U2I` | 2 | `pass_purchased` | customer | [`d4a2f4805bed10b9abcc7382dacf06404bc9c84dbe4a5a1775fcadbf70c2db0a`](https://stellar.expert/explorer/testnet/tx/d4a2f4805bed10b9abcc7382dacf06404bc9c84dbe4a5a1775fcadbf70c2db0a) | 4,200,733 | 2026-08-18T04:00:47.899Z |
| F48 | `GCMVXPO2FPDY4E3LOAFUKZKHZZGYKRB6BAUJNVXZNBFL52XJLEUOCH6U` | 1 | `pass_purchased` | customer | [`b8433e608dcf1159fb4f4c37be25ed457ceb401579716f941f00f5af9a87c6a0`](https://stellar.expert/explorer/testnet/tx/b8433e608dcf1159fb4f4c37be25ed457ceb401579716f941f00f5af9a87c6a0) | 4,196,419 | 2026-08-17T22:00:39.529Z |
| F49 | `GCNKZBG5THOTN3G4SHT2IHEJN3O2FLLHXDLGYX3RQRAAUQIF7VBLYPGP` | 5 | `pass_purchased` | customer | [`33f47c50649807b825999a290c7c1b03fe3522956223523f0a3be6dc177769a9`](https://stellar.expert/explorer/testnet/tx/33f47c50649807b825999a290c7c1b03fe3522956223523f0a3be6dc177769a9) | 4,205,767 | 2026-08-18T11:01:04.936Z |
| F50 | `GCQPDMEMOIIKYSNZV5OVGLI6DXPANXVRQ6MSG6SAHIY3PLGI3YRRSKTW` | 4 | `pass_purchased` | customer | [`e08900b3f0551b8e7da80e64278becc97816c9647df8a3bb2782e274fff0096e`](https://stellar.expert/explorer/testnet/tx/e08900b3f0551b8e7da80e64278becc97816c9647df8a3bb2782e274fff0096e) | 4,210,078 | 2026-08-18T17:00:57.375Z |
| F51 | `GCR4JB3TV7FZCXD4GKLYOWUYMHJL4KQIUUN23UGNKQRRP2L33NE6L4LM` | 2 | `review_submitted`, `pass_purchased` | reviewer, customer | [`3d464a520615491ff78cacb06aacd6e6258c544182fdda317f967f5cda97214a`](https://stellar.expert/explorer/testnet/tx/3d464a520615491ff78cacb06aacd6e6258c544182fdda317f967f5cda97214a) | 4,081,475 | 2026-08-11T06:06:27.875Z |
| F52 | `GCS4JBIHS7OSEXMDC6OZVE2HVAWRS6IA37ABY3C7RYG2Z3EPEGWVLG7J` | 2 | `review_submitted`, `merchant_profile_set` | reviewer, merchant | [`16d7df67b92659cde63d36ea82d9f60bc41ab6c78f0c64248f0336f1c2c65e61`](https://stellar.expert/explorer/testnet/tx/16d7df67b92659cde63d36ea82d9f60bc41ab6c78f0c64248f0336f1c2c65e61) | 4,139,379 | 2026-08-14T14:39:21.446Z |
| F53 | `GCSDWPYEOVAOYDRG3NQ2SVFO43C6RBNUY6P7PRUGB3TPBD2DPTD3YBVW` | 4 | `pass_purchased` | customer | [`cfed7d391f166d7d9cd958b024a19a66f0b7bac741741355c89fce7879b3facc`](https://stellar.expert/explorer/testnet/tx/cfed7d391f166d7d9cd958b024a19a66f0b7bac741741355c89fce7879b3facc) | 4,184,268 | 2026-08-17T05:06:20.695Z |
| F54 | `GCWRDRGWCRQZBZUKLO6CFEXLX5VOZLPI7NVA3ZKEL5SXXCMCRHNZGDMV` | 3 | `pass_purchased` | customer | [`26a11ed56c69c1ee3f00643de060b4f7855da6ccf916333051e45320adc7d4aa`](https://stellar.expert/explorer/testnet/tx/26a11ed56c69c1ee3f00643de060b4f7855da6ccf916333051e45320adc7d4aa) | 4,201,452 | 2026-08-18T05:00:50.646Z |
| F55 | `GCYI3MOEQMEEPO6EQDNPQQP4IA2EL3OUI5OO2D4TSZQS7PXEE5E5VJJ3` | 1 | `pass_purchased` | customer | [`7a79b23814c90e5f8a5f938999d7565f2f358a3a7f65cabdc7b7497394495fc4`](https://stellar.expert/explorer/testnet/tx/7a79b23814c90e5f8a5f938999d7565f2f358a3a7f65cabdc7b7497394495fc4) | 4,189,951 | 2026-08-17T13:00:40.280Z |

`indexedAt` is the application's cache timestamp. The ledger number and linked Stellar transaction are the authoritative proof.

#### Visual transaction evidence

![Transaction proof 1](public/transaction1.png)

![Transaction proof 2](public/transaction2.png)

### Reproduce the report

With valid local Firebase and Stellar configuration:

```bash
pnpm users:wallet-report --output ./wallet-interactions-export.json --force
```

This is a private administrative export. Review and redact optional emails, notifications, and provider-management records before sharing it. The exporter paginates the retained collections, validates every record, enriches indexed events with still-retained Stellar RPC actor topics, excludes session tokens and challenges, and sorts blockchain activity by ledger and event index. See [scripts/export-user-wallet-interactions.ts](scripts/export-user-wallet-interactions.ts).

## User feedback

Source: [User Feedback Spreadsheet](https://docs.google.com/spreadsheets/d/1yemfWq2ck5gLixD1YWBz11nuzsmo38dh6v7O0RAebDw/edit?usp=sharing). The sheet contains **55 responses**, all with a matching wallet record in the cross-referenced indexed snapshot. Ratings range from 4–5, with an average of **4.78/5**.

Observed themes include fast Stellar payments, quick pass visibility after purchase, clear customer value, and a smooth overall flow. Improvement comments specifically mention wallet connection taking too long or being confusing initially, making redemption instructions easier to find, clarifying campaign pages, and keeping fees low and transparent.

### Feedback and implemented improvements

| Feedback message/theme | Implemented response | Evidence |
| --- | --- | --- |
| Wallet connection could feel slow or confusing at first. | Persisted wallet sessions, network checks, explicit loading states, and recoverable reconnect errors. | [Wallet provider](src/components/wallet/wallet-provider.tsx), [wallet/auth commits](https://github.com/ianpurif/wrenpass/commit/34077b1) |
| Redemption instructions should be easier to find. | Pass details keep the branded QR, redemption action, and current-owner approval requirement together. | [Redemption implementation](src/server/redemption), [redemption commit](https://github.com/ianpurif/wrenpass/commit/0eddce4) |
| Campaign pages should explain the offer more clearly. | The purchase view groups price, service value, bonus, expiration, remaining supply, merchant details, and purchase action. | [Campaign page](src/app/campaigns/%5BcampaignId%5D/page.tsx), [campaign UX commit](https://github.com/ianpurif/wrenpass/commit/4de6c71) |
| Fees should stay low and transparent. | The platform fee is shown in the financial terms and the contract uses the lower sustainable fee configuration. | [Campaign contract](contracts/wrenpass-campaign/src/lib.rs), [fee commit](https://github.com/ianpurif/wrenpass/commit/73452a7) |
| Users valued fast payment confirmation and pass visibility. | Purchases reconcile immediately while the event indexer provides cursor-based recovery. | [Event recovery](#cicd-and-production-operations), [purchase-sync commit](https://github.com/ianpurif/wrenpass/commit/6ec06fc) |

The full unedited set remains visible on the [on-chain reviews page](https://wrenpass.vercel.app/reviews) and through each linked transaction.

![On-chain WrenPass reviews](public/usersreview.png)

## Product and engineering screenshots

### Product UI

![WrenPass offer explanation](public/productui2.png)

![WrenPass merchant dashboard](public/productui3.png)

![WrenPass customer passes](public/productui4.png)

### Mobile responsive UI

<table>
  <tr>
    <td align="center"><img src="public/mobile-view1.png" width="220" alt="WrenPass mobile landing page" /></td>
    <td align="center"><img src="public/mobile-view2.png" width="220" alt="WrenPass mobile campaign form" /></td>
    <td align="center"><img src="public/mobile-view3.png" width="220" alt="WrenPass mobile redemption scanner" /></td>
    <td align="center"><img src="public/mobile-view4.png" width="220" alt="WrenPass mobile campaign purchase" /></td>
  </tr>
  <tr>
    <td align="center">Landing</td>
    <td align="center">Create campaign</td>
    <td align="center">Redeem pass</td>
    <td align="center">Buy pass</td>
  </tr>
</table>

### CI/CD and test output

The captured CI run shows all application, contract/provenance, and critical browser jobs passing.

![Successful WrenPass CI run](public/ci-cd2.png)

The protected delivery workflow completed a Vercel deployment.

![Successful Vercel deployment workflow](public/ci-cd3.png)

The captured local test run shows **59 passing test files and 165 passing tests**, which is above the required three-test screenshot threshold.

![WrenPass passing test output](public/Test-output.png)

### Monitoring and analytics

Sentry captures production errors, transactions, releases, and health signals.

![WrenPass Sentry project overview](public/sentry1.png)

![WrenPass Sentry monitoring dashboard](public/sentry2.png)

![WrenPass Sentry issue capture](public/sentry3.png)

PostHog receives privacy-safe product and web analytics.

![WrenPass PostHog integration](public/posthog1.png)

![WrenPass PostHog analytics dashboard](public/posthog2.png)

## Run locally

### Requirements

| Tool        | Pinned version  |
| ----------- | --------------- |
| Node.js     | `22.20.0`       |
| pnpm        | `11.16.0`       |
| Rust        | `1.96.1`        |
| Rust target | `wasm32v1-none` |
| Stellar CLI | `27.0.0`        |
| Soroban SDK | `27.0.5`        |

Freighter must be installed and set to Testnet for real wallet flows. Never share a secret seed or recovery phrase.

### Install and start

```bash
git clone https://github.com/ianpurif/wrenpass.git
cd wrenpass
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

On Windows PowerShell, replace the copy command with:

```powershell
Copy-Item .env.example .env.local
```

### Environment variables

Use [.env.example](.env.example) as the only template. Replace its placeholders in `.env.local`. Never commit `.env.local`.

| Group           | Variables                                                                                                                                                                                                               | Purpose                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Firebase Admin  | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`                                                                                                                                                  | Server sessions, event cache, notifications, leases, and operational records |
| Cloudinary      | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                                                                                                                                  | Merchant and campaign image management                                       |
| Gmail SMTP      | `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`, `EMAIL_FROM`                                                                                                                                                              | Essential email notifications                                                |
| Stellar network | `NEXT_PUBLIC_STELLAR_NETWORK`, `NEXT_PUBLIC_STELLAR_RPC_URL`                                                                                                                                                            | Network and RPC selection                                                    |
| Stellar asset   | `NEXT_PUBLIC_STELLAR_ASSET_CODE`, `NEXT_PUBLIC_STELLAR_ASSET_ISSUER`, `NEXT_PUBLIC_STELLAR_ASSET_CONTRACT_ID`                                                                                                           | Configured payment asset                                                     |
| Contracts       | `NEXT_PUBLIC_WRENPASS_CONTRACT_ID`, `NEXT_PUBLIC_WRENPASS_METADATA_CONTRACT_ID`, `NEXT_PUBLIC_WRENPASS_PUBLISHER_CONTRACT_ID`, `NEXT_PUBLIC_WRENPASS_REDEMPTION_CONTRACT_ID`, `NEXT_PUBLIC_WRENPASS_REVIEW_CONTRACT_ID` | Deployed suite addresses                                                     |
| Sponsorship     | `STELLAR_REVIEW_SPONSOR_SECRET`                                                                                                                                                                                         | Server-held sponsored review and redemption-request account                  |
| Sentry          | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                                                                                                                                           | Error monitoring and source maps                                             |
| PostHog         | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`                                                                                                                                                                   | Privacy-safe product analytics                                               |
| Operations      | `CRON_SECRET`                                                                                                                                                                                                           | Protected scheduled recovery endpoint                                        |
| Vercel workflow | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`                                                                                                                                                                    | Protected GitHub deployment environment                                      |

The three Vercel values belong in GitHub environment secrets, not in a committed file. The Stellar sponsor secret is server-only and must belong to a dedicated funded Testnet account.

## Test and verify

### Application quality gate

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Contract quality and provenance

```bash
pnpm contract:fmt
pnpm contract:clippy
pnpm contract:test
pnpm contract:build
pnpm contract:verify:testnet
```

### Browser and integration checks

```bash
pnpm e2e:install
pnpm e2e
pnpm services:smoke
pnpm stellar:smoke
pnpm offchain:audit
```

### Operational checks

```bash
pnpm operations:run
pnpm stellar:ttl:plan
pnpm users:wallet-report --output ./wallet-interactions-export.json --force
```

### Current local validation

Validation completed on 2026-08-12 against the current workspace:

| Check                          | Result                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm lint`                    | Passed                                                                             |
| `pnpm typecheck`               | Passed                                                                             |
| `pnpm test`                    | 61 files passed; 180 tests passed                                                  |
| `pnpm contract:test`           | 60 Rust contract tests passed                                                      |
| `pnpm contract:verify:testnet` | Five deployed contract WASM hashes and three interaction evidence records verified |
| `pnpm build`                   | Production build passed; 23 routes generated or registered                         |

The test strategy focuses on financial rules, authorization, invalid state transitions, event idempotency, wallet/session races, UI loading and errors, responsive workflows, and critical browser journeys. Contract tests include positive and negative cases for campaign creation, supply limits, purchases, payment distribution, gifting, redemption, refunds, metadata authorization, sponsored requests, and reviews.

## CI/CD and production operations

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It contains three independent jobs:

1. **Application quality gate:** frozen install, dependency audit at high severity, lint, TypeScript, Vitest, and production build.
2. **Contracts and Testnet provenance:** pinned Rust and Stellar CLI, format, Clippy, Rust tests, contract build, and byte-for-byte deployed WASM verification.
3. **Critical browser journeys:** Playwright on Chromium with an uploaded report artifact.

### Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) is a protected manual Vercel workflow. It supports preview and production. Production is limited to `main`; credentials are read from the selected GitHub environment. The exact Vercel CLI version is pinned.

Contract releases use [scripts/deploy-contract-suite.ts](scripts/deploy-contract-suite.ts). The process supports a dry-run plan, deterministic IDs, restart-safe validation, locked builds, generated bindings, an immutable manifest, and post-deployment verification. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Event recovery and TTL

- A successful transaction triggers immediate reconciliation for fast UI updates.
- The event indexer uses cursor-based Stellar RPC reads and idempotent Firestore writes.
- A protected scheduled operation recovers missed events and notification delivery.
- A Firestore lease makes duplicate cron delivery safe.
- TTL inspection and sponsored extension protect contract instances, WASM, and persistent entries from archival.
- Temporary indexing or email failure cannot change the authoritative on-chain result.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) and [docs/PRODUCTION.md](docs/PRODUCTION.md) for release identity, checks, recovery, monitoring, and alerting evidence.

### Repository history

At snapshot commit [`6ec06fc659187bb2c4375ee50c10ad1165685e5e`](https://github.com/ianpurif/wrenpass/commit/6ec06fc659187bb2c4375ee50c10ad1165685e5e), the repository has **65 commits**. The history covers contract development, Testnet deployment, off-chain decentralization migrations, wallet security, event indexing, monitoring, CI/CD, product UI, performance, and bug fixes. This exceeds the Level 4 minimum of 15 meaningful commits.

## Level 3 evidence

✅ **Completed.** The Orange Belt requirements are covered by the reusable evidence below:

- Advanced Rust/Soroban contracts, integer-safe payment distribution, fixed supply, ownership, lifecycle rules, refunds, authorization, events, indexes, and TTL: [Soroban contracts](#soroban-contracts).
- Atomic inter-contract publishing and campaign validation: [publisher contract](contracts/wrenpass-publisher/src/lib.rs).
- Stellar RPC event streaming, idempotent indexing, reconciliation, and scheduled recovery: [event operations](#cicd-and-production-operations).
- CI/CD, locked builds, deterministic deployment, and Testnet provenance: [CI/CD](#cicd-and-production-operations), [deployment guide](docs/DEPLOYMENT.md), and [Testnet proof](#testnet-deployment-proof).
- Responsive UI, loading/error states, contract tests, frontend tests, and browser checks: [screenshots](#product-and-engineering-screenshots) and [test commands](#test-and-verify).
- Live demo, documentation, contract addresses, and transaction evidence: [live app](https://wrenpass.vercel.app), [demo video](https://x.com/wrenpasscorp/status/2087435276172120326?s=20), and [Testnet proof](#testnet-deployment-proof).

## Level 4 evidence

✅ **Completed.** The Green Belt requirements are covered without repeating Level 3 explanations:

- Production MVP and real-world service-business use case: [product](#product), [live app](https://wrenpass.vercel.app), and [production evidence](docs/PRODUCTION.md).
- Product structure, trust boundaries, on-chain authority, and operational recovery: [architecture](#architecture), [source-of-truth boundaries](#source-of-truth), and [security policy](SECURITY.md).
- Monitoring, analytics, responsive UI, and optimized user flows: [monitoring](#monitoring-and-analytics) and [screenshots](#product-and-engineering-screenshots).
- Five deployed Testnet contracts, 15+ commits, wallet interactions, feedback, and required documentation: [Testnet proof](#testnet-deployment-proof), [wallet proof](#proof-of-10-user-wallets), [feedback](#user-feedback), and [repository history](#repository-history).

## Level 5 proof

✅ **Completed.** The Blue Belt evidence is summarized here for fast review:

| Requirement | Evidence |
| --- | --- |
| 50+ Testnet wallets and real activity | **55** spreadsheet wallet addresses matched the retained indexed records, with **168** on-chain records and linked transaction hashes. See [wallet proof](#proof-of-10-user-wallets). |
| Product iteration from feedback | **55** feedback responses, average rating **4.78/5**, and the implemented response map in [User feedback](#user-feedback). |
| Professional product presentation | [Pitch deck](https://docs.google.com/presentation/d/1l36aUPqkt4kFOKeSLH_rNM5dZJEhT5Vf/edit?usp=sharing&ouid=100999101172428274179&rtpof=true&sd=true), [demo video](https://x.com/wrenpasscorp/status/2087435276172120326?s=20), and [live app](https://wrenpass.vercel.app). |
| 20+ meaningful commits | **65 commits** at snapshot [`6ec06fc`](https://github.com/ianpurif/wrenpass/commit/6ec06fc659187bb2c4375ee50c10ad1165685e5e), exceeding the requirement. See [repository history](#repository-history). |
| Updated documentation | This README, [deployment runbook](docs/DEPLOYMENT.md), [operations runbook](docs/OPERATIONS.md), [production evidence](docs/PRODUCTION.md), and [security policy](SECURITY.md). |
| Submission evidence | [Feedback spreadsheet](https://docs.google.com/spreadsheets/d/1yemfWq2ck5gLixD1YWBz11nuzsmo38dh6v7O0RAebDw/edit?usp=sharing), [transaction screenshots](#visual-transaction-evidence), and [analytics/monitoring screenshots](#monitoring-and-analytics). |

## Current limits and roadmap

### Current limits

- The deployment uses Testnet and a Testnet USDC-like asset, not production USDC.
- Merchant identity is wallet-authenticated business metadata. WrenPass does not yet provide Know Your Business (KYB) checks or guarantee that a business is legitimate.
- The customer-protection reserve follows contract rules. It is not a promise of a guaranteed full refund.
- Four historical contract deployment transaction hashes were not retained. Contract identity is instead verified from the exact historical source and installed WASM hash.
- On-chain reviews and public metadata are permanent. Users should not submit private or sensitive information.
- Mainnet readiness still requires an independent contract audit, threat-model review, production asset selection, incident drills, legal review, and a new immutable deployment manifest.

### Roadmap

1. **Pilot and user acquisition:** Start with Stellar users, creators, hackathon communities, online service providers, and selected local businesses. Each merchant shares its own campaign link and brings its existing audience into WrenPass.
2. **Security gate:** Complete an external Soroban audit, operational drills, and mainnet asset/configuration review.
3. **Mainnet release:** Deploy a newly verified contract suite, use a production Stellar asset, fund isolated sponsor and operations accounts, and publish a new release manifest.
4. **Mainnet vision:** Build a merchant-distributed marketplace of useful service offers from barbers, tutors, designers, fitness coaches, repair shops, and creators. WrenPass remains focused on creating, selling, protecting, gifting, and redeeming real service value, not speculative trading.

## Documentation index

- [Deployment and release workflow](docs/DEPLOYMENT.md)
- [Production evidence](docs/PRODUCTION.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Security policy and trust boundaries](SECURITY.md)
- [Testnet deployment manifest](deployments/testnet.json)
- [Wallet interaction exporter](scripts/export-user-wallet-interactions.ts)
