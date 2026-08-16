# WrenPass operations

## Production signals

- Sentry records uncaught client/server errors, failed scheduled operations, failed event sync, and unexpected sponsor failures. Default PII collection is disabled and request cookies, headers, bodies, and query strings are removed before sending.
- PostHog records anonymous page views and a small allowlist of product events. Wallet addresses, emails, transaction hashes, review messages, and financial values are never sent.
- Vercel Web Analytics and Speed Insights provide deployment-level traffic and performance data.

Production source maps upload only from Vercel or CI when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are available. Local builds do not upload artifacts.

## Scheduled recovery

Vercel calls `/api/cron/operations` daily with `CRON_SECRET` as a bearer token. The handler uses a Firestore lease so overlapping or duplicate deliveries are harmless. It performs:

1. Cursor-based, idempotent Soroban event indexing and notification delivery.
2. Expiration-notification recovery.
3. TTL inspection for core, metadata, review, and redemption contracts, including deployed Wasm code.
4. Sponsored TTL extension only when an entry falls below the safety threshold.

Post-transaction sync remains the low-latency path; the cron is the durable recovery path for missed events and temporary provider outages.

## Testnet activity simulator

cron-job.org calls `/api/cron/testnet-simulation` once per hour. A 55-minute Firestore reservation window prevents overlapping or duplicate executions without skipping the next hourly trigger.

Every generated Testnet wallet secret is encrypted with RSA-OAEP and SHA-256 before the server creates a `testnet_simulator_accounts` record. Firestore contains only `public_key`, `encrypted_secret`, and `created_at`. Client access is denied, and neither the ciphertext nor plaintext is included in APIs, logs, monitoring, analytics, or wallet reports. The RSA private key remains offline and is required to decrypt a selected ciphertext manually.

To inspect one account, copy only its `encrypted_secret` value from the Firebase console and decrypt it locally:

```powershell
$ciphertext = "COPY_ENCRYPTED_SECRET_HERE"
$encryptedPath = Join-Path $env:TEMP "wrenpass-testnet-secret.bin"
$privateKeyPath = "C:\path\to\simulator-private.pem"
[IO.File]::WriteAllBytes($encryptedPath, [Convert]::FromBase64String($ciphertext))
openssl pkeyutl -decrypt -inkey $privateKeyPath -in $encryptedPath -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256
Remove-Item -LiteralPath $encryptedPath
```

## Runbooks

- Inspect current TTL and generate manual CLI commands: `pnpm stellar:ttl:plan`
- Inspect and safely maintain TTL with the configured operations account: `pnpm stellar:ttl:maintain`
- Run the complete scheduled recovery workflow locally: `pnpm operations:run`
- Verify the retained Firestore boundary and schemas: `pnpm offchain:audit`
- Remove expired wallet challenge/session records: `pnpm offchain:cleanup-auth`
- Verify public Stellar configuration: `pnpm stellar:smoke`

Create alerts in Sentry for new production errors and failed cron monitors. Treat any event retention-gap signal or TTL maintenance error as urgent because it can affect notification completeness or contract availability; confirmed on-chain financial state remains authoritative and unaffected by an indexing outage.
