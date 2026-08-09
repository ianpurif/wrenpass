# ROLE

Act as a senior full-stack engineer, Stellar/Soroban engineer, QA engineer, and product engineer.

Build **WrenPass**, a Stellar-powered platform that lets small businesses raise working capital by pre-selling limited future service passes to customers.

Your architecture decisions should be senior-level, but your code must remain simple, readable, maintainable, and understandable by a junior developer.

---

# REPOSITORY CONVENTIONS

- Use `pnpm` and keep `pnpm-lock.yaml` committed.
- Application code lives under `src/` and uses the `@/*` TypeScript path alias.
- Keep shared visual primitives in `src/components/ui` and shared page chrome in `src/components/layout`.
- Define durable design tokens in `src/app/globals.css`; avoid repeating raw brand colors in components.
- Before completing a frontend phase, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Never commit local environment files. Document variable names with placeholders in `.env.example` when a later phase introduces configuration.
- Use Stellar RPC for current ledger and Soroban access; do not introduce Horizon as the primary Soroban API.
- Run `pnpm stellar:smoke` after changing public Stellar network or asset configuration.
- Wallet sessions are server-verified SEP-53 challenges stored as opaque Firestore records; never authorize a server action from a client-provided address alone.

---

# ENGINEERING WORKFLOW

Use these principles throughout the project:

- Work in small, complete vertical slices.
- Define acceptance criteria before implementing.
- Read relevant documentation before using unfamiliar APIs.
- Prefer official documentation and working examples over assumptions.
- Never invent SDK functions, contract APIs, configuration, or external-service behavior.
- Validate each piece before building on top of it.
- Treat every phase like an engineering ticket with:
  - Context
  - To Do
  - Not To Do
  - Acceptance Criteria

- Use a Red → Green → Refactor mindset:
  - Define expected behavior.
  - Implement only what is needed.
  - Test it.
  - Refactor only after it works.

- Do not allow broken code to accumulate.
- Keep context focused on the current phase.
- Do not make unrelated changes.
- Never use destructive Git commands such as `git reset --hard` or delete unrelated existing work.

If the repository contains `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or similar project instructions, read them before changing anything.

If appropriate, update or create `AGENTS.md` with durable project-specific rules discovered during development. Do not duplicate temporary implementation details there.

---

# PHASE CONTROL

You MUST work one phase at a time.

Never implement work belonging to a future phase.

For every phase:

1. Read the phase requirements.
2. Inspect the relevant existing code.
3. Research current official documentation when required.
4. Define or confirm acceptance criteria.
5. Implement only that phase.
6. Add meaningful tests.
7. Run the tests.
8. Run relevant linting, type checking, and build validation.
9. Test the actual expected behavior.
10. Review your own implementation for security, simplicity, duplication, and unnecessary complexity.
11. Fix every issue discovered.
12. Re-run validation.
13. Summarize what changed and what was verified.
14. STOP.

At the end of every successfully completed non-final phase, your final line MUST be:

**Type Continue to proceed to Phase X.**

Replace `X` with the next phase number.

NEVER automatically proceed.

Even if the next phase appears easy, wait for the user to type **Continue**.

If the current phase fails validation, do not proceed. Fix it first.

---

# HUMAN INTERVENTION

If any step requires the user to manually:

- Create an account
- Sign up for a service
- Install a browser extension
- Generate credentials
- Create an API key
- Generate an App Password
- Configure Firebase
- Configure Cloudinary
- Configure Gmail
- Add environment variables
- Fund a Stellar wallet
- Approve something in a dashboard
- Configure a domain
- Verify an email
- Complete OAuth
- Complete KYC/KYB
- Change third-party settings
- Perform any manual external action

STOP immediately.

Give short and exact instructions containing:

1. What the user needs to open.
2. What they need to create or configure.
3. The exact environment-variable names or settings required.
4. Where they should place them.
5. What they should tell you after completing the step.

Never invent credentials.

Never fabricate API keys, IDs, wallet addresses, contract addresses, secrets, or configuration values.

Never ask the user to paste secrets into chat.

Prefer instructions such as:

> Add the value to `.env.local` as `CLOUDINARY_API_SECRET`, then reply `Configured`.

After the user completes the manual step, resume the SAME phase.

Manual intervention does not count as phase completion.

---

# PRODUCT CONTEXT

## Product

**WrenPass**

WrenPass lets a small business raise working capital by pre-selling future service value.

Example:

> Pay 5 USDC today and receive 6 USDC worth of haircuts later.

The merchant receives working capital.

The customer receives additional service value for supporting the business early.

There is no speculative token.

The value received is redeemable business value.

---

# CORE PRODUCT RULE

Keep the product centered around this flow:

> Merchant creates WrenPass campaign → Customer buys with Stellar USDC → Merchant receives working capital → Customer receives WrenPass → Customer later receives the real service → Pass is redeemed.

Everything implemented must directly support this flow.

---

# USERS

There are two roles.

## Customer

Can:

- Connect Stellar wallet
- View a shared campaign
- Buy a WrenPass
- View owned passes
- Gift an active pass
- Display a QR code
- Approve redemption
- Receive eligible refunds
- Optionally provide an email for notifications

## Merchant

Can:

- Connect Stellar wallet
- Create merchant profile
- Create campaigns
- Share campaign page
- Receive USDC
- View campaign performance
- Scan WrenPass QR codes
- Fulfill and redeem passes

---

# CORE FEATURES

Implement only these product features.

## Merchant Profile

Merchant profile contains essential business information, wallet address, and images.

---

## Campaign Creation

A merchant defines:

- Campaign name
- Service description
- Pass purchase price
- Service value
- Customer bonus
- Number of passes
- Expiration date
- Optional campaign image

Example:

> Price: 5 USDC
> Service value: 6 USDC
> Supply: 100 passes

Important financial campaign rules must become immutable once sales begin.

---

## Fixed Pass Supply

Every campaign has a maximum supply.

Example:

> 100 passes.

The contract must never allow pass `101`.

Display:

- Total supply
- Sold
- Remaining
- Redeemed

---

## USDC Purchase

Customers buy WrenPasses with **USDC on Stellar**.

The payment is processed through Soroban.

Do not build custom fiat payment integrations.

Do not integrate GCash, Maya, Stripe, PayPal, or local banking APIs.

WrenPass should use the Stellar ecosystem.

For Testnet, use a properly configured Stellar test asset

Never invent a USDC contract address.

Make asset identifiers environment-configurable.

---

## Payment Distribution

A purchase can contain:

- Merchant release
- Customer-protection reserve
- WrenPass platform fee

Represent percentages using basis points or another integer-safe mechanism.

Never perform financial calculations using JavaScript floating-point arithmetic.

Campaign financial rules must be explicit and immutable after sales start.

---

## Customer-Protection Reserve

A portion of each payment remains controlled by the smart contract.

It provides limited customer protection and is released according to campaign rules.

Do NOT market this as a guaranteed full refund unless the contract actually guarantees the full amount.

The UI must clearly communicate the protected amount and refund conditions.

---

## Customer Passes

Each pass needs:

- Unique pass ID
- Campaign ID
- Current owner
- Status

Required states:

- Active
- Redeemed
- Expired
- Refunded

A gift changes ownership. It does not create another pass.

Do not build an NFT marketplace.

---

## Pass Gifting

The owner of an active pass may transfer it to another Stellar wallet.

A redeemed, expired, or refunded pass cannot be transferred.

---

## QR Redemption

The customer displays a QR code for an active WrenPass.

The merchant scans it.

The QR code identifies the pass but MUST NOT function as an unrestricted bearer credential.

The current pass owner must authorize redemption using their wallet.

After successful authorization:

> Active → Redeemed

The same pass must never be redeemable twice.

---

## Refunds

Implement only simple contract-defined refund behavior.

Do not create complex dispute resolution.

Refund eligibility must be deterministic where possible.

Never promise that the reserve guarantees full reimbursement when it does not.

If full campaign cancellation requires the merchant to replenish released funds, enforce that requirement before allowing full refunds.

Keep the rules simple and clearly displayed before purchase.

---

## Campaign Page

Each campaign needs a shareable page showing:

- Merchant
- Service
- Purchase price
- Service value
- Bonus
- Expiration
- Remaining passes
- Campaign status
- Relevant customer-protection information
- Buy button

Do not build a large marketplace or discovery algorithm.

The primary distribution model is merchants sharing their own campaign links.

---

## Merchant Dashboard

Show only useful information:

- Campaigns
- USDC raised
- Passes sold
- Passes remaining
- Passes redeemed
- Available merchant funds
- Protected funds
- Recent activity

---

## Customer Dashboard

Show:

- Active passes
- Redeemed passes
- Expired passes
- Refunded passes
- Gifted passes
- Received passes
- Purchase history

---

## Notifications

Send essential email notifications only:

- Pass purchased
- Pass gifted
- Pass received
- Pass redeemed
- Pass nearing expiration
- Refund processed
- Campaign sold out

Use Gmail SMTP through Nodemailer.

Do not add SMS, push notifications, WhatsApp, or another notification provider.

---

# TECH STACK

Use this stack unless the existing project already contains a compatible implementation that should reasonably be reused.

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide React
- Framer Motion
- React Hook Form
- Zod

## Design

Use **UI/UX Pro Max — Educational Platform template** as the main visual design direction: https://uupm.cc/

Use it for:

- Visual hierarchy
- Spacing
- Card treatment
- Typography hierarchy
- Layout rhythm
- Dashboard structure
- Overall polished educational-platform feel

Do not blindly clone it.

Adapt the design to WrenPass.

Use **https://21st.dev/** selectively for appropriate components such as:

- Hero
- Navigation
- Campaign cards
- Stats cards
- Forms
- Stepper
- Empty states
- Loading states
- Dialogs
- Tabs
- Buttons

Do not install or copy unnecessary components.

Only use components compatible with the existing:

> Next.js + React + Tailwind + Framer Motion

Prefer the simplest appropriate component.

If visual references cannot be accessed, ask the user for screenshots rather than inventing an unrelated design.

---

# STELLAR STACK

Use:

- Stellar Wallets Kit
- Freighter
- `@stellar/stellar-sdk`
- Stellar RPC
- Stellar Testnet
- Stellar Mainnet
- Stellar USDC
- Rust
- Soroban SDK
- Stellar CLI

Before writing Stellar integrations, read the current official Stellar documentation for the installed/current SDK versions.

Do not rely on remembered APIs when current documentation is available.

Do not use Horizon as the primary Soroban API unless current official Stellar documentation demonstrates that it is required for a specific feature.

---

# BACKEND

Use the existing Next.js application.

Use:

- Next.js Route Handlers
- Next.js Server Actions
- Node.js

Do not add:

- Express
- NestJS
- Fastify
- Another standalone backend

unless an existing project architecture already requires it and changing it would be worse.

---

# DATABASE

Use:

**Firebase Firestore**

Firestore is for OFF-CHAIN application data.

Examples:

- User profile
- Merchant profile
- Campaign metadata
- Cloudinary URLs
- Notification records
- Indexed Soroban events
- UI-oriented cached/indexed data

Financial truth must remain on Stellar/Soroban.

Do not treat Firestore as the authoritative source for:

- Pass ownership
- Pass redemption
- Contract balances
- Fixed supply
- USDC settlement

Use Firebase Admin SDK on the server where practical.

Do not expose privileged Firebase credentials to the browser.

---

# STORAGE

Use:

**Cloudinary**

Store:

- Merchant logo
- Campaign image

Use server-side signed uploads where sensitive configuration is required.

Never expose the Cloudinary API secret to client code.

Avoid storing sensitive documents unless they are genuinely required.

---

# NOTIFICATIONS

Use:

- Gmail SMTP
- Nodemailer

Use an App Password or current supported secure Gmail SMTP configuration.

Never hardcode credentials.

---

# TESTING STACK

Prefer a small, practical test stack.

Use:

- Vitest for unit/integration tests
- React Testing Library for important React behavior
- Rust/Soroban contract tests for smart contracts

Do not create hundreds of low-value tests.

Test important behavior and failure cases.

---

# SOFTWARE ENGINEERING PRINCIPLES

Always apply:

## KISS

Choose the simplest implementation that fully solves the requirement.

## DRY

Remove meaningful duplication, but do not create premature abstractions just because two small pieces look similar.

## YAGNI

Do not implement hypothetical future requirements.

## Single Responsibility

Functions, components, modules, and contracts should have clear jobs.

## Separation of Concerns

Keep:

- UI
- application logic
- data access
- Stellar interaction
- smart-contract logic
- third-party integrations

properly separated.

## Secure Defaults

Assume user input is untrusted.

Validate on both relevant client boundaries and server/contract boundaries.

Authorize every privileged operation.

Keep secrets server-side.

## Clear Naming

Choose obvious names.

Prefer:

`createCampaign()`

over:

`executeCampaignFactoryStrategy()`.

## Explicit Over Clever

Avoid magic behavior and overly abstract frameworks.

Junior developers should be able to trace the flow.

---

# CODING RULES

- TypeScript strictness should remain enabled.
- Avoid `any` unless there is an exceptional documented reason.
- Validate external input with Zod where appropriate.
- Handle errors explicitly.
- Never silently swallow errors.
- Show useful user-facing errors without leaking sensitive information.
- Keep functions small when reasonable.
- Keep files focused.
- Avoid giant utility modules.
- Avoid circular dependencies.
- Avoid duplicate business logic across frontend and backend.
- Never trust client-provided financial values.
- Perform financial calculations using integer-safe values.
- Never expose secrets in client bundles.
- Keep dependencies minimal.
- Prefer platform/framework functionality over adding another package.
- Remove unused code.
- Remove unused imports.
- Remove abandoned implementations.
- Do not leave dead code commented out.

---

# COMMENTS

Keep comments minimal.

Only comment when the reasoning is not obvious.

Do not write comments such as:

```ts
// Increment count
count++;
```

A useful comment explains something such as:

> Why a specific Stellar transaction ordering is required.

---

# UI RULES

The interface must feel:

- Modern
- Premium
- Friendly
- Trustworthy
- Simple
- Financially credible

Use the Educational Platform design reference, but adapt it for fintech.

Use Framer Motion carefully for:

- Page entrances
- Card transitions
- Step transitions
- Dialogs
- Success states

Animations should improve feedback.

Do not add animations simply because Framer Motion exists.

Avoid:

- Excessive gradients
- Excessive glassmorphism
- Constant movement
- Huge hero sections
- Crypto clichés
- Neon Web3 visuals
- Overloaded dashboards

WrenPass should look like a modern financial product, not a crypto trading application.

---

# SECURITY RULES

Never:

- Store private keys
- Request seed phrases
- Generate production wallet secrets for users
- Put secrets in source code
- Commit `.env` files
- Trust a QR code alone for redemption
- Trust Firestore for blockchain ownership
- Trust client-calculated payment values
- Permit merchant actions without authorization
- Permit duplicate redemption
- Allow pass supply to exceed the campaign maximum

Wallet signatures must authorize relevant on-chain actions.

---

# GIT RULES

Before modifying the project:

- Inspect `git status`.
- Preserve existing unrelated changes.
- Never overwrite user work without necessity.
- Never use destructive Git commands.
- Never force push.

If Git is available and creating a local checkpoint is safe, you may create a clean phase-specific local commit after all acceptance criteria pass.

Never push automatically.

If existing uncommitted user changes would become mixed with your commit, do not commit. Report the state instead.

---

# PHASE 0 — PROJECT AUDIT AND CONTEXT ENGINEERING

## Context

Understand the project before writing code.

## To Do

Inspect:

- Repository structure
- Existing source files
- Existing smart contracts
- Package versions
- Existing design
- Existing tests
- Environment-variable usage
- Existing Stellar integration
- Firestore integration
- Cloudinary integration
- Gmail/Nodemailer integration
- Existing documentation
- Git state

Run the current project's existing validation commands where safe.

Read current official documentation relevant to the technologies already installed.

Review the WrenPass requirements against the existing implementation.

Produce a concise implementation map showing:

- What already exists
- What can be reused
- What is missing
- What should be removed
- Any conflicting architecture
- Any security problems already present
- Exact phases required

## Not To Do

Do NOT modify application code.

Do NOT install dependencies.

Do NOT refactor.

Do NOT delete files.

Do NOT start Phase 1.

## Acceptance Criteria

- Existing project is understood.
- Existing working functionality is identified.
- Baseline build/test status is known.
- Major technical risks are identified.
- Required documentation has been reviewed.
- No application code was changed.
- Phase plan remains compatible with the actual repository.

Then STOP and output:

**Type Continue to proceed to Phase 1.**

---

# PHASE 1 — PROJECT FOUNDATION AND DESIGN SYSTEM

## Goal

Establish a clean foundation and WrenPass visual system without implementing product workflows yet.

## To Do

Reuse the existing project where possible.

Configure only missing required dependencies.

Set up:

- Tailwind
- Lucide
- Framer Motion
- React Hook Form
- Zod

Create or refine:

- Global layout
- Typography
- Spacing
- Color system
- Buttons
- Inputs
- Cards
- Dialog patterns
- Loading patterns
- Error patterns
- Responsive navigation
- Page containers

Use the Educational Platform reference as the primary visual direction.

Select only useful 21st.dev components.

Create/update `AGENTS.md` if appropriate with stable project rules and validation commands.

## Not To Do

Do not implement:

- Stellar wallet behavior
- Firestore
- Cloudinary
- SMTP
- Smart contracts
- Campaign creation
- Purchases

## Tests and Validation

Run:

- Lint
- TypeScript validation
- Production build
- Relevant component tests
- Responsive/manual UI verification

Check:

- Mobile layout
- Desktop layout
- Keyboard accessibility for shared components
- No console errors
- No unnecessary design dependencies

## Acceptance Criteria

- Application shell works.
- Shared design components are reusable.
- Visual direction matches WrenPass.
- Build passes.
- Type checking passes.
- Existing functionality remains intact.

Then STOP:

**Type Continue to proceed to Phase 2.**

---

# PHASE 2 — FIRESTORE, CLOUDINARY, AND EMAIL FOUNDATION

## Goal

Create the minimal off-chain service layer.

## Manual Setup Gate

Before implementation, detect whether required credentials/configuration already exist.

If Firebase, Cloudinary, or Gmail SMTP requires user setup, STOP and provide exact instructions.

Do not continue until configuration exists.

## To Do

Create small server-side modules for:

- Firestore
- Cloudinary
- Gmail SMTP/Nodemailer

Add centralized environment validation.

Create only the minimum data models required for:

- User profile
- Merchant
- Campaign metadata
- Notification
- Indexed blockchain event

Keep data access behind small repository/service boundaries.

## Security

- Firebase privileged access remains server-side.
- Cloudinary secrets remain server-side.
- Gmail credentials remain server-side.
- `.env.local` must never be committed.

## Tests

Test:

- Environment validation
- Firestore repository behavior
- Cloudinary adapter behavior
- Email generation/sending adapter behavior
- Failure paths

Use mocks where external calls are not necessary.

When configured, perform one safe real integration smoke test per service where appropriate.

## Acceptance Criteria

- Services initialize correctly.
- Missing configuration produces clear errors.
- Secrets do not reach client code.
- Firestore read/write works.
- Cloudinary upload integration works.
- Gmail SMTP integration works.
- Tests and build pass.

Then STOP:

**Type Continue to proceed to Phase 3.**

---

# PHASE 3 — STELLAR WALLET AND NETWORK FOUNDATION

## Goal

Establish safe Stellar connectivity before implementing WrenPass contracts.

## To Do

Research current official Stellar documentation first.

Implement:

- Stellar Wallets Kit
- Freighter support
- Wallet connect
- Wallet disconnect
- Connected wallet state
- Network configuration
- Stellar RPC client
- Stellar SDK configuration
- Address validation
- USDC/test-asset configuration
- Basic wallet balance display where useful

Implement wallet-based authentication/session behavior only as complex as required to protect server actions.

Prefer signed challenges and secure server sessions over trusting a client-provided wallet address.

## Manual Setup Gate

If Freighter must be installed or a Testnet account funded manually, STOP and provide exact instructions.

Never request private keys or seed phrases.

## Tests

Verify:

- Connect
- Disconnect
- Reconnect/session behavior
- Invalid address handling
- Wrong/unsupported network handling
- RPC failure handling
- Signature verification if implemented
- Configuration switching between Testnet/Mainnet

## Acceptance Criteria

A real wallet can connect and safely interact with the application.

No WrenPass financial contract functionality exists yet.

Then STOP:

**Type Continue to proceed to Phase 4.**

---

# PHASE 4 — SOROBAN CAMPAIGN FOUNDATION

## Goal

Implement the minimum contract architecture for WrenPass campaign creation and fixed pass supply.

## Before Coding

Read current Soroban documentation and examples for:

- Contract storage
- Authorization
- Token interaction
- Events
- Contract deployment
- Testing

Do not guess APIs.

## To Do

Implement the simplest contract architecture that supports:

- Merchant
- Campaign ID
- Pass price
- Service value
- Maximum supply
- Expiration
- Financial configuration
- Campaign state
- Sold count
- Redeemed count

Use the previously intended Campaign Factory + Campaign Contract architecture only if it remains the simplest safe design after inspecting the existing project and current Soroban capabilities.

Do not create unnecessary contracts.

Enforce merchant authorization.

Enforce maximum pass supply.

Emit meaningful events.

## Tests

Write Soroban tests for:

- Campaign creation
- Invalid campaign configuration
- Unauthorized actions
- Maximum supply boundaries
- Immutable rules
- Expiration
- Campaign state changes

Include negative tests.

## Acceptance Criteria

Contract behavior—not merely compilation—matches the defined campaign rules.

All Rust/Soroban tests pass.

Then STOP:

**Type Continue to proceed to Phase 5.**

---

# PHASE 5 — USDC PURCHASE, PASS OWNERSHIP, AND FUND DISTRIBUTION

## Goal

Make a WrenPass purchasable.

## To Do

Implement:

- Stellar asset/Soroban token interaction
- USDC/test-asset purchase
- Unique pass ID assignment
- Ownership
- Fixed supply enforcement
- Merchant release
- Customer reserve
- Platform fee
- Purchase event

Never trust purchase amounts from the frontend.

Calculate amounts in the contract using integer-safe units.

## Tests

Test:

- Successful purchase
- Insufficient payment
- Incorrect asset
- Sold-out campaign
- Expired campaign
- Exact supply boundary
- Correct merchant amount
- Correct reserve amount
- Correct platform fee
- Correct owner assignment
- Unauthorized calls

Verify token balances before and after operations.

## Acceptance Criteria

A customer can purchase a pass and contract balances/state are mathematically correct.

Then STOP:

**Type Continue to proceed to Phase 6.**

---

# PHASE 6 — GIFTING, REDEMPTION, RESERVE RELEASE, AND REFUNDS

## Goal

Complete the WrenPass lifecycle.

## To Do

Implement:

- Pass gifting
- Owner authorization
- Redemption
- Reserve release after redemption
- Expiration handling
- Deterministic refund behavior
- Campaign cancellation rules if applicable

A QR code must never be sufficient to redeem a pass without owner authorization.

## Tests

Test:

- Valid gift
- Gift by non-owner
- Gift redeemed pass
- Gift expired pass
- Successful redemption
- Redemption by wrong merchant
- Redemption without owner approval
- Double redemption
- Reserve release
- Refund eligibility
- Invalid refund
- Cancellation constraints
- Expired-pass behavior

## Acceptance Criteria

The complete pass lifecycle works and every important invalid transition is rejected.

Then STOP:

**Type Continue to proceed to Phase 7.**

---

# PHASE 7 — MERCHANT EXPERIENCE

## Goal

Give merchants a complete usable workflow.

## To Do

Implement:

- Merchant profile
- Campaign creation form
- Campaign creation validation
- Campaign publishing
- Shareable campaign page
- Merchant dashboard

Connect campaign creation to the actual Soroban contract.

Firestore should store only useful off-chain metadata.

## Tests

Test:

- Invalid campaign data is rejected
- Contract failure is surfaced correctly
- Campaign data stays consistent with on-chain state
- Dashboard reflects campaign information

Perform a real campaign creation flow.

## Acceptance Criteria

A merchant can create and share a real WrenPass campaign.

Then STOP:

**Type Continue to proceed to Phase 8.**

---

# PHASE 8 — CUSTOMER PURCHASE AND PASS EXPERIENCE

## Goal

Give customers the complete non-redemption WrenPass experience.

## To Do

Implement:

- Public campaign purchase UI
- Wallet approval
- USDC purchase
- Success/failure states
- Customer pass dashboard
- Active pass details
- Pass gifting UI
- Purchase history

Display financial information clearly before transaction approval.

The customer must see:

- Amount paid
- Service value
- Bonus
- Expiration
- Protected amount/rules

## Tests

Test:

- Successful purchase UI
- Rejected wallet transaction
- Contract failure
- Sold-out campaign
- Expired campaign
- Pass appears after purchase
- Successful gift
- Invalid gift
- Ownership updates

## Acceptance Criteria

A real customer can buy and gift a WrenPass through the UI.

Then STOP:

**Type Continue to proceed to Phase 9.**

---

# PHASE 9 — QR REDEMPTION, EVENT SYNC, AND NOTIFICATIONS

## Goal

Complete the operational loop.

## To Do

Implement:

- QR generation
- Merchant QR scanner
- Owner-approved redemption
- Soroban event ingestion
- Firestore event persistence
- Dashboard synchronization
- Gmail SMTP notifications

Relevant events include:

- Campaign created
- Pass purchased
- Pass gifted
- Pass redeemed
- Refund processed
- Campaign sold out

Do not make Firestore the source of blockchain truth.

## Tests

Test:

- Valid QR
- Invalid QR
- Stolen/copied QR without owner authorization
- Successful redemption
- Double-redemption prevention
- Event ingestion idempotency
- Duplicate events
- Missed/temporary RPC errors
- Email trigger conditions
- Notification failures without transaction rollback

## Acceptance Criteria

A merchant can scan a real customer's pass, the customer approves redemption, Soroban updates state, Firestore reflects the event, and the appropriate email notification is triggered.

Then STOP:

**Type Continue to proceed to Phase 10.**

---

# PHASE 10 — COMPLETE SYSTEM VALIDATION AND TESTNET RELEASE

## Goal

Prove the complete system works as one product.

Do not add new features.

## Full User Journey

Test the real end-to-end flow:

1. Merchant connects wallet.
2. Merchant creates campaign.
3. Customer connects wallet.
4. Customer buys WrenPass using Testnet asset.
5. Merchant receives correct funding.
6. Reserve remains correct.
7. Customer receives pass.
8. Customer gifts a pass.
9. New owner receives ownership.
10. Owner displays QR.
11. Merchant scans QR.
12. Owner approves.
13. Pass becomes redeemed.
14. Reserve is released according to rules.
15. Dashboard data updates.
16. Notification is generated.

Also test major failure flows.

## Quality Gate

Run:

- Full unit test suite
- Contract tests
- Integration tests
- Critical Playwright flows
- ESLint
- TypeScript checks
- Production Next.js build
- Security review
- Dependency review
- Environment-variable review

Review for:

- Dead code
- Duplicate logic
- Unused dependencies
- Overengineering
- Missing authorization
- Client-trusted financial values
- Secret exposure
- Incorrect contract state transitions
- Race conditions
- Double redemption
- Broken responsive layout
- Accessibility issues
- Error-handling gaps

Fix every material issue discovered.

Re-run validation after fixes.

## Manual Testnet Validation

Perform the critical workflow against Stellar Testnet, not only mocks.

If a manual user action is required, stop and request it.

## Acceptance Criteria

WrenPass must be usable end-to-end on Testnet.

A phase is NOT successful merely because:

- TypeScript compiles
- Tests are mocked green
- The homepage loads

The actual WrenPass behavior must work.

---

# FINAL OUTPUT AFTER PHASE 10

Provide a concise final implementation report containing:

- Features completed
- Architecture used
- Smart contracts deployed
- Testnet configuration
- Tests performed
- Final build status
- Remaining known limitations
- Required Mainnet configuration
- Security considerations
- Exact manual steps still required before production

Do not claim production readiness unless production requirements were genuinely completed.

---

# NON-GOALS

Do NOT implement:

- Native WrenPass token
- Public pass marketplace
- Public pass trading
- Auctions
- Cash lending
- Interest
- Staking
- Yield farming
- DeFi integrations
- DAO governance
- NFT marketplace
- Loyalty points
- Referral systems
- Social feed
- Chat
- AI features
- Complex recommendation system
- Complex merchant credit scoring
- Multiple payment assets
- Built-in fiat payment rails
- GCash
- Maya
- Stripe
- PayPal
- Mobile application
- Microservices
- GraphQL
- Kubernetes
- Custom Stellar node
- Custom blockchain
- Premature performance optimization

If a feature is not required for the core WrenPass flow, do not build it.

---

# DECISION RULE

Whenever multiple implementations are possible, choose in this order:

1. Correct
2. Secure
3. Simple
4. Maintainable
5. Easy to test
6. Consistent with existing code

Do not choose a technically impressive solution when a simpler solution works equally well.

The goal is not to demonstrate how much code you can generate.

The goal is to build a reliable implementation of **WrenPass** that genuinely works.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository validation commands

- `pnpm contract:fmt` checks Rust formatting.
- `pnpm contract:clippy` treats Rust lint warnings as errors.
- `pnpm contract:test` runs the local Soroban contract suite.
- `pnpm contract:build` builds the deployable Wasm without network access.
- Run `pnpm typecheck` and `pnpm build` sequentially because both use generated Next.js types.
