# Analytics — StellarSwap

StellarSwap ships a **privacy-friendly, provider-agnostic** analytics layer built
on [PostHog](https://posthog.com). It is **opt-in via environment variables**:
with no key configured, no script is loaded and every tracking call is a safe
no-op. This keeps local dev, CI, and tests free of network calls while giving
production a full product-analytics funnel.

- **Module:** [`frontend/src/lib/analytics.ts`](../frontend/src/lib/analytics.ts)
- **Provider:** [`frontend/src/components/Analytics.tsx`](../frontend/src/components/Analytics.tsx) (mounted in `app/layout.tsx`)

## Setup

1. Create a PostHog project (PostHog Cloud or self-hosted).
2. Add the project API key to the frontend environment:

   ```bash
   # frontend/.env.local  (or Vercel project env vars)
   NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```

3. Redeploy. The client loads PostHog from its CDN on first paint and begins
   capturing the events below. Remove the key to disable instantly.

## Architecture

```
 User action ──▶ track('event', props) ──▶ window.posthog.capture
   (component)        (analytics.ts)             │
                                                 ▼
                                    PostHog ingestion + dashboards
```

- **No hard dependency.** PostHog is injected from the CDN at runtime only when a
  key exists — the bundle stays lean and builds never require the package.
- **Memory persistence, no autocapture.** Initialised with `persistence: 'memory'`
  (no cookies/localStorage), `autocapture: false`, and session recording off, so
  we only ever record the explicit events declared in the `AnalyticsEvent` union.
- **Single source of truth.** Every event name is enumerated in the
  `AnalyticsEvent` type; adding an event is a one-line type change.

## Privacy

- **No raw wallet addresses leave the browser.** Wallet identity is reduced to a
  non-reversible short hash (`hashId`) before `identify()` is called.
- **No secrets, ever.** The harness and app never log secret keys.
- **No PII.** We do not collect names, emails, or IP-derived profiles.

## Events tracked

| Event | When | Key properties |
| --- | --- | --- |
| `app_loaded` | App first mounts | — |
| `page_viewed` | Every client-side route change | `path` |
| `wallet_connect_started` | User clicks Connect | — |
| `wallet_connected` | Freighter approves connection | `network` |
| `wallet_connect_failed` | Connect rejected / no extension | `reason` |
| `wallet_disconnected` | User disconnects | — |
| `swap_submitted` | Swap sent to wallet | `pair`, `tokenIn`, `tokenOut`, `exactSide`, `priceImpact` |
| `swap_succeeded` | Swap confirmed on-chain | `pair`, `txHash` |
| `swap_failed` | Swap reverted / rejected | `pair`, `message` |
| `liquidity_add_submitted` / `_succeeded` | Add-liquidity flow | `pair` |
| `liquidity_remove_submitted` / `_succeeded` | Remove-liquidity flow | `pair` |
| `liquidity_failed` | Liquidity action failed | `pair`, `message` |

## Metrics & funnels to build in PostHog

These events directly support the core product funnel:

1. **Onboarding funnel:** `app_loaded` → `wallet_connect_started` → `wallet_connected`
   (measures connect drop-off and missing-extension rate).
2. **Activation funnel:** `wallet_connected` → `swap_submitted` → `swap_succeeded`
   (measures first-swap conversion and on-chain success rate).
3. **Reliability:** ratio of `swap_failed` to `swap_submitted`, broken down by
   `pair` and failure `message`.
4. **Engagement:** repeat `swap_succeeded` per hashed wallet (retention),
   liquidity participation rate.

Recommended dashboard tiles: connect-conversion %, swap success %, swaps/day,
unique wallets/day, top pairs, failure reasons.

## Dashboard screenshots

> Add exported PostHog dashboard images to `docs/screenshots/` and link them
> here once a production key is live, e.g. `![Funnel](screenshots/analytics-funnel.png)`.
> Until a key is configured the app emits no events by design.

## Verifying it works

In the browser console on a deployed build with a key set:

```js
window.posthog && window.posthog.capture('debug_ping', { ok: true })
```

The event appears in PostHog → Activity within seconds. With no key set,
`window.posthog` is undefined and the app behaves identically minus tracking.
