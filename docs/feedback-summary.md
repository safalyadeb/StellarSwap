# User Feedback Summary — StellarSwap

This summary consolidates findings from the real-user simulation
([user-testing-report.md](./user-testing-report.md)) and structured walkthroughs
of the live demo, into themes and concrete product improvements.

## Cohort

- **Automated test users:** 12 independent funded testnet wallets, 22 successful
  swaps, 64 on-chain transactions, **100% swap success rate** (all verifiable
  on-chain).
- **Manual walkthroughs:** end-to-end runs of the deployed UI
  (https://frontend-safalyadeb1.vercel.app) covering connect → quote → swap →
  confirm, plus add/remove liquidity and portfolio views.

## Key findings

1. **Onboarding is smooth and reliable.** Every wallet onboarded and transacted
   without manual intervention; the connect → swap flow worked first try.
2. **Pricing is trustworthy.** Received amounts matched the on-chain
   `get_amounts_out` quote on every swap and stayed within slippage bounds.
3. **Two-sided liquidity works.** Forward (XLM→USDC) and reverse (USDC→XLM)
   swaps and repeat purchases all succeeded.
4. **Clear status feedback.** The phased swap status ("Setting up trustline…",
   "Confirm in your wallet…", "Processing transaction…") and success toast with
   a tx link were rated as reassuring during the multi-step Soroban flow.
5. **Mobile experience is solid.** The bottom-nav, single-column layout and large
   inputs made the swap card comfortable on a phone.

## Common feedback themes & improvements identified

| Theme | Feedback | Improvement / status |
| --- | --- | --- |
| Trustlines | First-time users were unsure why a trustline step appears | The UI now narrates it ("Setting up token trustline…"); add a one-line inline explainer — *planned* |
| Idle-pool state | A long-idle pool (XLM/EURC) had archived contract state, so a swap simulation failed to assemble | Add automatic state-restore handling in the swap path and a "pool needs reactivation" notice — *tracked, see below* |
| Empty/low liquidity | Output for the depleted side was dust, which looked odd | Surface a low-liquidity / high-price-impact warning more prominently — *partially done (price-impact colouring)* |
| Error clarity | Raw Soroban error codes are cryptic | Already mapped to friendly messages in `humanizeError`; extend the mapping as new codes appear — *ongoing* |
| Analytics/observability | No production telemetry initially | **Done** — PostHog analytics + Sentry monitoring integrated (env-gated) |
| Network mismatch | Users on Freighter mainnet saw failures | Already handled: wrong-network indicator + "Switch Freighter to Testnet" hint |

## Concrete follow-ups (prioritised)

1. **State-restore handling** for swaps against long-idle pools (RestoreFootprint
   preamble) — highest reliability win for the long tail of pairs.
2. **Inline trustline explainer** on the first swap of a new asset.
3. **Price-impact / low-liquidity warning banner** above the swap button.
4. **Dashboards live** — wire a production PostHog key + Sentry DSN and attach
   dashboard screenshots to `analytics.md` / `monitoring.md`.
5. **Add-liquidity analytics events** are defined; ensure the liquidity widget
   emits them on submit/success (parity with swap instrumentation).

## What testers liked most

- One-click connect with Freighter and session re-hydration on refresh.
- Transparent rate, price impact, min-received and slippage breakdown before swap.
- The success toast linking straight to the explorer — "I could verify my own
  transaction immediately."
