'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton } from './ConnectButton';

const TABS = [
  { href: '/', label: 'Swap' },
  { href: '/pool', label: 'Pool' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/explore', label: 'Explore' },
];

export function Navbar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="relative z-10 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Left: logo + tabs */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 shadow-pink">
              <Image src="/logo.jpg" alt="StellarSwap Logo" width={32} height={32} className="object-cover w-full h-full" />
            </div>
            <span className="hidden sm:block font-bold text-txt-primary">StellarSwap</span>
          </Link>

          <nav className="flex items-center gap-1 bg-bg-surface/60 rounded-pill p-1">
            {TABS.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 sm:px-4 py-1.5 rounded-pill text-sm font-medium transition-colors ${
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

        {/* Right: network badge + connect */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 bg-bg-surface/60 rounded-pill px-3 py-2 text-xs text-txt-secondary">
            <span className="w-2 h-2 rounded-full bg-uni-pink" />
            Stellar Testnet
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
