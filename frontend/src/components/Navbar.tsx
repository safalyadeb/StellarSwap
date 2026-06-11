'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton } from './ConnectButton';

const TABS = [
  {
    href: '/',
    label: 'Swap',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>
      </svg>
    ),
  },
  {
    href: '/pool',
    label: 'Pool',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        <path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z"/>
      </svg>
    ),
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
        <polyline points="7 10 10 7 13 10 16 7"/>
      </svg>
    ),
  },
  {
    href: '/explore',
    label: 'Explore',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="relative z-10 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: logo + desktop nav tabs */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 shadow-pink">
                <Image src="/logo.jpg" alt="StellarSwap Logo" width={32} height={32} className="object-cover w-full h-full" />
              </div>
              <span className="font-bold text-txt-primary">StellarSwap</span>
            </Link>

            {/* Nav tabs — desktop only */}
            <nav className="hidden sm:flex items-center gap-1 bg-bg-surface/60 rounded-pill p-1">
              {TABS.map(tab => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-4 py-1.5 rounded-pill text-sm font-medium transition-colors ${
                    isActive(tab.href)
                      ? 'bg-bg-interactive text-txt-primary'
                      : 'text-txt-tertiary hover:text-txt-primary'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: network badge + wallet */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 bg-bg-surface/60 rounded-pill px-3 py-2 text-xs text-txt-secondary">
              <span className="w-2 h-2 rounded-full bg-uni-pink" />
              Stellar Testnet
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ─────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-surface border-t border-bg-interactive safe-area-bottom">
        <div className="flex items-stretch justify-around">
          {TABS.map(tab => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-3 transition-colors ${
                  active ? 'text-uni-pink' : 'text-txt-tertiary'
                }`}
              >
                <span className={active ? 'text-uni-pink' : 'text-txt-tertiary'}>{tab.icon}</span>
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
