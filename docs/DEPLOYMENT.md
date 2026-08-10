# Deployment workflow

## Contract release

Contract releases use pinned source, Rust `1.96.1`, Stellar CLI `27.0.0`, Soroban SDK `27.0.5`, locked Cargo dependencies, and unoptimized WASM. Changing any of those inputs requires a new manifest and a full Testnet validation.

The deployment identity must be a named Stellar CLI identity backed by the operating system's secure store. Do not place its secret in an environment file.

Set these non-secret values in the current shell:

```text
WRENPASS_RELEASE=<unique-release-name>
STELLAR_DEPLOYER_IDENTITY=<stellar-cli-identity-name>
STELLAR_PLATFORM_ADDRESS=<public-G-address-for-that-identity>
STELLAR_PAYMENT_ASSET_CONTRACT_ID=<configured-asset-C-address>
```

Preview deterministic contract IDs without submitting transactions:

```bash
pnpm contract:deploy:plan:testnet
```

Deploy only after reviewing the plan:

```bash
pnpm contract:deploy:testnet
```

The release string, network, package name, and WASM hash produce a deterministic 32-byte salt. The deployer address and salt therefore produce predictable contract IDs. The script is restart-safe: an existing contract is accepted only when its deployed WASM hash matches the release artifact, and existing initialization is accepted only when its configuration matches.

After deployment:

1. Add a new immutable manifest under `deployments/` with the source commit, exact toolchain, WASM hashes, contract IDs, and transaction evidence.
2. Run the manifest verifier against the selected network.
3. Regenerate TypeScript bindings from the release artifacts.
4. Update environment contract IDs together; do not mix suites from different releases.
5. Run `pnpm stellar:smoke` and the real purchase, gift, redemption, refund, review, and notification journeys.
6. Record explorer links for the contract addresses and representative successful interactions.

The historical Testnet manifest records `null` deployment transaction hashes because the original deploy command outputs were not retained. Its contract/source identity is still reproducible from the exact source commit and verified against the on-chain WASM hash. Future releases must retain the deployment transaction evidence when the explorer indexes it.

## Application release

`.github/workflows/ci.yml` is the merge gate. It validates the application, contracts, Testnet provenance, dependency audit, and critical Playwright journeys without repository secrets.

`.github/workflows/deploy.yml` is a protected manual Vercel delivery workflow. It invokes the exact Vercel CLI release `58.9.0` in an isolated pnpm execution environment, so Vercel's optional framework adapters do not enter the application dependency graph. The workflow requires GitHub environment secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The workflow pulls the selected Vercel environment, runs `vercel build`, then uploads the same `.vercel/output` with `vercel deploy --prebuilt`. Production runs are restricted to `main`; the `production` GitHub environment should also require approval.

Production activation, environment creation, first deployment, and monitoring evidence belong to the production release phase. Do not trigger this workflow until those external controls are configured and reviewed.
