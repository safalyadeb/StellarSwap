//! Privacy-friendly, provider-agnostic analytics.
//!
//! Wraps PostHog but adds ZERO hard dependencies: the PostHog client is loaded
//! from its CDN at runtime *only* when `NEXT_PUBLIC_POSTHOG_KEY` is configured.
//! With no key set (local dev, CI, tests), every function is a safe no-op, so
//! builds stay green and nothing is sent.
//!
//! Privacy: we never capture secret keys or raw wallet addresses. Wallet
//! identifiers are hashed before they leave the browser, and PostHog is started
//! with `persistence: 'memory'` + no autocapture so we only record the explicit
//! product events declared in `AnalyticsEvent`.

'use client';

type Props = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    posthog?: any;
  }
}

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/** All product events we track — keep this the single source of truth. */
export type AnalyticsEvent =
  | 'app_loaded'
  | 'page_viewed'
  | 'wallet_connect_started'
  | 'wallet_connected'
  | 'wallet_connect_failed'
  | 'wallet_disconnected'
  | 'swap_quoted'
  | 'swap_submitted'
  | 'swap_succeeded'
  | 'swap_failed'
  | 'liquidity_add_submitted'
  | 'liquidity_add_succeeded'
  | 'liquidity_remove_submitted'
  | 'liquidity_remove_succeeded'
  | 'liquidity_failed';

let ready = false;
let loading = false;

export function analyticsEnabled(): boolean {
  return typeof window !== 'undefined' && !!KEY;
}

/** Idempotently load + initialise PostHog from the CDN. No-op without a key. */
export function initAnalytics(): void {
  if (!analyticsEnabled() || ready || loading) return;
  loading = true;

  // Official PostHog snippet (trimmed) — injects the array shim, then loads the lib.
  /* eslint-disable */
  // @ts-ignore
  !(function (t: any, e: any) {
    var o: any, n: any, p: any, r: any;
    e.__SV ||
      ((window as any).posthog = e),
      (e._i = []),
      (e.init = function (i: any, s: any, a: any) {
        function g(t: any, e: string) {
          var o = e.split('.');
          2 == o.length && ((t = t[o[0]]), (e = o[1]));
          t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }
        ((p = t.createElement('script')).type = 'text/javascript'),
          (p.async = !0),
          (p.src = (s && s.api_host) || HOST) + '/static/array.js';
        (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
        var u = e;
        for (
          void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
            u.people = u.people || [],
            u.toString = function (t: any) {
              var e = 'posthog';
              return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
            },
            u.people.toString = function () {
              return u.toString(1) + '.people (stub)';
            },
            o =
              'init capture register register_once unregister identify reset people.set people.set_once group alias'.split(
                ' ',
              ),
            n = 0;
          n < o.length;
          n++
        )
          g(u, o[n]);
        e._i.push([i, s, a]);
      }),
      (e.__SV = 1);
  })(document, window.posthog || []);
  /* eslint-enable */

  window.posthog?.init(KEY, {
    api_host: HOST,
    persistence: 'memory', // no cookies/localStorage — privacy-friendly
    autocapture: false, // only the explicit events below
    capture_pageview: false, // we send page_viewed ourselves on route change
    disable_session_recording: true,
    loaded: () => {
      ready = true;
    },
  });
}

/** Track a product event. Safe no-op when analytics is disabled. */
export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (!analyticsEnabled()) return;
  try {
    window.posthog?.capture(event, props);
  } catch {
    /* never let analytics break the app */
  }
}

/** Associate subsequent events with a (hashed) wallet identity. */
export function identifyWallet(publicKey: string): void {
  if (!analyticsEnabled()) return;
  try {
    window.posthog?.identify(hashId(publicKey), { chain: 'stellar', network: 'testnet' });
  } catch {
    /* noop */
  }
}

export function resetIdentity(): void {
  if (!analyticsEnabled()) return;
  try {
    window.posthog?.reset();
  } catch {
    /* noop */
  }
}

/** Stable, non-reversible short id from a public key — never send the raw key. */
export function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `wallet_${(h >>> 0).toString(36)}`;
}
