import type { Metadata, Viewport } from 'next';
import './globals.css';
import { WalletProvider } from '../context/WalletContext';
import { ToastProvider } from '../context/ToastContext';
import { ToastContainer } from '../components/ui/ToastContainer';
import { Navbar } from '../components/Navbar';

export const metadata: Metadata = {
  title: 'StellarSwap — DEX on Stellar',
  description: 'Swap tokens and provide liquidity on Stellar. A Uniswap V2-style AMM on Soroban.',
  icons: {
    icon: '/favicon-round.png',
    apple: '/favicon-round.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {/* Wave glow blobs — top */}
        <div className="glow-wave-blob glow-top-1" />
        <div className="glow-wave-blob glow-top-2" />
        <div className="glow-wave-blob glow-top-3" />
        {/* Wave glow blobs — bottom */}
        <div className="glow-wave-blob glow-bot-1" />
        <div className="glow-wave-blob glow-bot-2" />
        <div className="glow-wave-blob glow-bot-3" />
        <ToastProvider>
          <WalletProvider>
            <div className="relative z-10 flex flex-col min-h-screen">
              <Navbar />
              {/* pb-20 sm:pb-0 reserves space for the mobile bottom nav */}
              <main className="flex-1 px-4 py-6 sm:py-10 pb-24 sm:pb-10">{children}</main>
              <footer className="hidden sm:block px-6 py-6 text-center text-txt-disabled text-xs">
                StellarSwap · Stellar Testnet · Not audited — use at your own risk
              </footer>
            </div>
            <ToastContainer />
          </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
