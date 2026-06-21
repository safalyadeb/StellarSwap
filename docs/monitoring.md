# Monitoring & Observability — StellarSwap

StellarSwap integrates [Sentry](https://sentry.io) for frontend error monitoring
and performance tracing, plus a top-level React **error boundary** so users never
see a white screen or a raw stack trace. Like analytics, it is **opt-in via
environment variables** — with no DSN configured, nothing is loaded and all calls
are safe no-ops.

- **Module:** [`frontend/src/lib/monitoring.ts`](../frontend/src/lib/monitoring.ts)
- **Error boundary:** [`frontend/src/components/ErrorBoundary.tsx`](../frontend/src/components/ErrorBoundary.tsx) (wraps the whole app in `app/layout.tsx`)

## Setup

1. Create a Sentry project (platform: *Browser / React*).
2. Add the DSN to the frontend environment:

   ```bash
   # frontend/.env.local  (or Vercel project env vars)
   NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@oNNN.ingest.sentry.io/NNN
   NEXT_PUBLIC_SENTRY_ENV=testnet
   NEXT_PUBLIC_RELEASE=stellarswap@1.0.0
   ```

3. Redeploy. Sentry loads from its CDN on first paint and begins capturing
   uncaught errors, handled errors, and a 10% sample of performance traces.

## Architecture

```
                 ┌─────────────────────────────────────────┐
  Uncaught  ───▶ │ ErrorBoundary.componentDidCatch          │
  render error   │   → captureError() → Sentry              │──▶ Sentry
                 └─────────────────────────────────────────┘    (Issues,
  Handled    ───▶ captureError(e, ctx)  ─────────────────────▶   Alerts,
  swap error      (SwapWidget catch block)                       Performance)
  Trail      ───▶ addBreadcrumb('swap submitted', …) ─────────▶
```

- **No hard dependency.** The Sentry browser bundle is injected from the CDN at
  runtime only when a DSN exists.
- **Breadcrumbs** record the user's action trail (e.g. *swap submitted*) so an
  error report carries the steps that led to it.
- **Tracing** at `tracesSampleRate: 0.1` captures page-load and interaction spans
  for performance monitoring without overwhelming quota.

## What is tracked

| Signal | Source | Captured as |
| --- | --- | --- |
| Uncaught render errors | `ErrorBoundary` | Sentry issue + component stack |
| Failed swaps (handled) | `SwapWidget` catch | Sentry issue w/ pair + side context |
| Action trail | `addBreadcrumb` | Breadcrumbs on each issue |
| Performance | Browser tracing | Transaction spans (10% sample) |
| Release health | `NEXT_PUBLIC_RELEASE` | Errors grouped by release |

## Privacy & data scrubbing

- `sendDefaultPii: false` — no IP/user PII attached automatically.
- A `beforeSend` hook **scrubs Stellar keys** from every event: secret keys
  (`S…`) become `[secret-redacted]` and public keys/contract addresses
  (`G…`/`C…`) become `[address-redacted]` before transmission.
- Session replay is disabled.

## Alerting flow (recommended)

Configure in Sentry → Alerts:

1. **New issue** in `environment:production` → notify Slack/email immediately.
2. **Error rate spike** (e.g. swap failures > N in 5 min) → page on-call.
3. **Performance regression** (p75 transaction duration ↑) → daily digest.

Suggested escalation: Slack channel for all new issues → email for high-volume
issues → manual triage. Resolve issues per release to track regressions.

## Backend / indexer

The optional indexer (`indexer/`) logs structured errors to stdout and is
designed to run behind a process manager or container platform whose log drain
(e.g. Logtail, Datadog, the host's logs) provides backend observability. A
Sentry Node SDK can be added there with the same DSN pattern if/when the indexer
is deployed as a long-running service.

## Dashboard screenshots

> Add Sentry Issues / Performance screenshots to `docs/screenshots/` and link
> them here once a production DSN is live, e.g.
> `![Sentry issues](screenshots/sentry-issues.png)`.

## Verifying it works

With a DSN set, trigger a handled error (e.g. reject a swap in Freighter) — it
appears in Sentry → Issues within seconds, with the `swap` scope, the pair, and
the breadcrumb trail attached, and any addresses redacted. With no DSN set,
`window.Sentry` is undefined and the app runs identically minus reporting.
