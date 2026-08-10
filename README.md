# WrenPass

WrenPass is a Stellar-powered platform for small businesses to pre-sell limited future-service passes. Customers pay with a configured Stellar asset, receive an owner-authorized pass, and can later gift or redeem it. Financial state, supply, ownership, settlement, and lifecycle transitions remain on Stellar/Soroban.

## Architecture

- **Next.js 16 and React 19** provide the public campaign experience and wallet-gated merchant/customer workspaces.
- **Four Soroban contracts** manage campaigns and settlement, public metadata, redemption requests, and on-chain reviews.
- **Stellar RPC** is the primary ledger and contract interface.
- **SEP-53 wallet sessions** bind server actions to signed Freighter challenges.
- **Firestore** retains only operational off-chain records such as opaque sessions, notification delivery state, event indexes, provider references, leases, and rate limits.
- **Cloudinary** stores merchant and campaign images; Gmail SMTP sends essential notifications.
- **Sentry, PostHog, Vercel Analytics, and Speed Insights** cover privacy-constrained operational and product telemetry.

## Testnet contracts

| Contract | Address | Deployed WASM SHA-256 |
| --- | --- | --- |
| Campaign | [`CAFVI2...N76V5D`](https://stellar.expert/explorer/testnet/contract/CAFVI2IDYFQKBWVQ7V6JIEUSH63HWVPS2YAVGASW6QUKB24AA6N76V5D) | `aeec070bd69017b5201f25317908e3bdd9349971a7c8cf39ff9d1f1095c1ff33` |
| Metadata | [`CCPREV...IOVFDR`](https://stellar.expert/explorer/testnet/contract/CCPREVJISOBTO25UJSS53YIA7UMRXCYLUTJBA5K4CSGLTRI4P4IOVFDR) | `56ff566c2f2732deb02d690ec5e68316cc12b73f8a4a2fafc53840685c976e97` |
| Redemptions | [`CB6HZL...Y65QHN`](https://stellar.expert/explorer/testnet/contract/CB6HZLQJGSZBN6NCII2KGOHIQUSG33YQCM7XWGTUK6JTJ4HLSKY65QHN) | `3e7e47cc108d6376079b0453e1499248a84f7f09fde3e769df32a8e9f2c36c40` |
| Reviews | [`CCZ7KC...M6WY3`](https://stellar.expert/explorer/testnet/contract/CCZ7KC6SGTFJKOPVUFD6WYNBSYGOCHBUNV5HNR2AVGFP23KBOOMF6WY3) | `b0605d6e1da7fcb1229aa18a25ddd22ded196058945bc26577a145ab2fcb427c` |

The machine-readable [Testnet deployment manifest](deployments/testnet.json) pins the exact source commit, toolchain, contract address, and deployed WASM hash for every contract. `pnpm contract:verify:testnet` rebuilds each historical artifact and compares it to the code currently installed on Testnet.

Verified interaction evidence:

- [Pass purchase transaction](https://stellar.expert/explorer/testnet/tx/ec8da8a6aceeb6e9ae62fb0a7499f510831cbe0577a17d49bbff8a14a09ca6ec)
- [Pass redemption transaction](https://stellar.expert/explorer/testnet/tx/44991dba47a8d7d3de9a77af506eef3987967dec584a3a630258af65a136603e)

## Local development

Requirements:

- Node.js `22.20.0`
- pnpm `11.16.0`
- Rust `1.96.1` with `wasm32v1-none`
- Stellar CLI `27.0.0`

Copy `.env.example` to `.env.local`, replace placeholders locally, then run:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Never commit `.env.local`, private keys, seed phrases, Firebase credentials, SMTP credentials, or provider tokens.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contract:fmt
pnpm contract:clippy
pnpm contract:test
pnpm contract:build
pnpm contract:verify:testnet
pnpm e2e
pnpm stellar:smoke
pnpm offchain:audit
```

GitHub Actions runs the credential-free application, contract, dependency-security, provenance, and browser gates on pull requests and `main`. Deployment is a separate protected manual workflow that builds a Vercel artifact once and deploys that exact output.

## Operations and releases

- [Production operations](docs/OPERATIONS.md)
- [Contract and Vercel deployment](docs/DEPLOYMENT.md)
- [Security policy and trust boundaries](SECURITY.md)

This repository is configured for Testnet. Mainnet requires a fresh reviewed deployment manifest, production provider configuration, funded operational accounts, environment protection, and a completed release audit.
