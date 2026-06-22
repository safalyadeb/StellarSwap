//! Stellar wallet integration layer (Freighter).
//!
//! This module is the single integration point between StellarSwap and the
//! user's Stellar wallet. It wraps the official `@stellar/freighter-api` and
//! exposes the three capabilities the app needs:
//!
//!   1. Connect      — detect the extension and request access (permission).
//!   2. Address      — read the permitted public key + active network.
//!   3. Sign         — sign a transaction XDR with the wallet's secret key.
//!
//! The wallet library is `@stellar/freighter-api` (see frontend/package.json).
//! Consumers: `context/WalletContext.tsx` (connect flow) and
//! `lib/soroban.ts` (transaction signing).

import {
  isConnected as freighterIsConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api';

export interface WalletConnection {
  address: string;
  network: string | null;
}

/** Is the Freighter browser extension installed and available? */
export async function isWalletInstalled(): Promise<boolean> {
  const conn = await freighterIsConnected();
  return !!conn.isConnected;
}

/**
 * Connect the wallet: opens Freighter's approval popup (granting allow-list
 * permission) and returns the user's address + active network.
 * Throws if Freighter is not installed or the user rejects the request.
 */
export async function connectWallet(): Promise<WalletConnection> {
  if (!(await isWalletInstalled())) {
    throw new Error('Freighter not detected. Install the Freighter extension and refresh.');
  }
  // requestAccess opens the approval popup and returns the granted address.
  const access = await requestAccess();
  if (access.error) {
    throw new Error(typeof access.error === 'string' ? access.error : 'Connection rejected');
  }
  const net = await getNetwork();
  return { address: access.address, network: net.network ?? null };
}

/** Explicitly add this app to Freighter's allow-list (permission grant). */
export async function grantWalletPermission(): Promise<void> {
  await setAllowed();
}

/**
 * Return the permitted address + network without prompting, or null if the
 * extension is absent or the app has not been granted permission. Used to
 * re-hydrate a session on page reload.
 */
export async function getPermittedConnection(): Promise<WalletConnection | null> {
  if (!(await isWalletInstalled())) return null;
  const allowed = await isAllowed();
  if (!allowed.isAllowed) return null;
  const addr = await getAddress();
  if (!addr.address) return null;
  const net = await getNetwork();
  return { address: addr.address, network: net.network ?? null };
}

/**
 * Sign a transaction XDR with the connected wallet and return the signed XDR.
 * The app never touches the user's secret key — Freighter signs in-extension.
 * Throws if the user rejects the signature request.
 */
export async function signWithWallet(
  xdr: string,
  networkPassphrase: string,
  address: string,
  rejectionMessage = 'Transaction rejected in wallet',
): Promise<string> {
  const signed = await signTransaction(xdr, { networkPassphrase, address });
  if (signed.error) throw new Error(rejectionMessage);
  return signed.signedTxXdr;
}
