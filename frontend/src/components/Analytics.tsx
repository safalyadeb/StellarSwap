'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, track, analyticsEnabled } from '../lib/analytics';

/**
 * Mounts once at the app root. Initialises analytics (no-op without a key) and
 * emits a `page_viewed` event on every client-side route change.
 */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
    if (analyticsEnabled()) track('app_loaded');
  }, []);

  useEffect(() => {
    if (analyticsEnabled()) track('page_viewed', { path: pathname });
  }, [pathname]);

  return null;
}
