//! Error monitoring / observability — Sentry, loaded with zero hard deps.
//!
//! The Sentry browser bundle is loaded from its CDN at runtime *only* when
//! `NEXT_PUBLIC_SENTRY_DSN` is configured. Without a DSN (local dev, CI, tests)
//! every export is a safe no-op, so builds stay green and nothing is sent.
//!
//! Privacy: `sendDefaultPii` is off and we install a `beforeSend` scrubber that
//! strips anything resembling a Stellar secret/public key or address from event
//! messages before transmission.

'use client';

declare global {
  interface Window {
    Sentry?: any;
  }
}

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NEXT_PUBLIC_NETWORK ?? 'testnet';
const RELEASE = process.env.NEXT_PUBLIC_RELEASE ?? 'stellarswap@1.0.0';
const CDN = 'https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js';

let ready = false;
let loading = false;

export function monitoringEnabled(): boolean {
  return typeof window !== 'undefined' && !!DSN;
}

/** Strip Stellar keys/addresses from any string before it leaves the browser. */
function scrub(input: string): string {
  return input
    .replace(/\bS[A-Z2-7]{55}\b/g, '[secret-redacted]')
    .replace(/\b[GC][A-Z2-7]{55}\b/g, '[address-redacted]');
}

/** Idempotently load + initialise Sentry from the CDN. No-op without a DSN. */
export function initMonitoring(): void {
  if (!monitoringEnabled() || ready || loading) return;
  loading = true;

  const s = document.createElement('script');
  s.src = CDN;
  s.crossOrigin = 'anonymous';
  s.onload = () => {
    try {
      window.Sentry?.init({
        dsn: DSN,
        environment: ENV,
        release: RELEASE,
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        beforeSend(event: any) {
          try {
            if (event.message) event.message = scrub(event.message);
            for (const ex of event.exception?.values ?? []) {
              if (ex.value) ex.value = scrub(ex.value);
            }
          } catch {
            /* never block reporting on scrub failure */
          }
          return event;
        },
      });
      ready = true;
    } catch {
      /* noop */
    }
  };
  document.head.appendChild(s);
}

/** Report a handled error. Safe no-op when monitoring is disabled. */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!monitoringEnabled()) return;
  try {
    window.Sentry?.captureException(err, { extra: context });
  } catch {
    /* noop */
  }
}

/** Breadcrumb for debugging an error trail (e.g. "swap started"). */
export function addBreadcrumb(message: string, data: Record<string, unknown> = {}): void {
  if (!monitoringEnabled()) return;
  try {
    window.Sentry?.addBreadcrumb({ message: scrub(message), data, level: 'info' });
  } catch {
    /* noop */
  }
}
