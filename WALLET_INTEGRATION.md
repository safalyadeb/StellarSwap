# Wallet Integration — Stellar / Freighter

This document is the single source of truth for **how StellarSwap integrates a Stellar
wallet**. It maps each rubric requirement to the exact files and code that implement it.

> **TL;DR** — StellarSwap uses [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api)
> for a complete Connect-Wallet experience: permission grants (`requestAccess` / `setAllowed`
> / `isAllowed`), address retrieval (`getAddress`), and transaction signing (`signTransaction`).
> All wallet code lives in the `frontend/` package.

---

## Where the wallet code lives

| Concern | File |
|---|---|
| Library dependency | [`frontend/package.json`](frontend/package.json) → `"@stellar/freighter-api": "^4.1.0"` |
| **Freighter wrapper (single integration point)** | [`frontend/src/lib/wallet.ts`](frontend/src/lib/wallet.ts) |
| Wrapper unit tests | [`frontend/src/lib/__tests__/wallet.test.ts`](frontend/src/lib/__tests__/wallet.test.ts) |
| Connection state, permissions, address | [`frontend/src/context/WalletContext.tsx`](frontend/src/context/WalletContext.tsx) |
| Connect / Disconnect UI | [`frontend/src/components/ConnectButton.tsx`](frontend/src/components/ConnectButton.tsx) |
| Mounting the provider + button | [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx), [`frontend/src/components/Navbar.tsx`](frontend/src/components/Navbar.tsx) |
| Transaction signing & submission | [`frontend/src/lib/soroban.ts`](frontend/src/lib/soroban.ts) |

All `@stellar/freighter-api` calls are centralized in [`frontend/src/lib/wallet.ts`](frontend/src/lib/wallet.ts) (`connectWallet`, `getPermittedConnection`, `grantWalletPermission`, `signWithWallet`), which is unit-tested and asserted by a dedicated CI step (`Verify Stellar wallet integration (Freighter)` in [`.github/workflows/test.yml`](.github/workflows/test.yml)).

---

## Requirement 1 — Detect & integrate a Stellar wallet library

StellarSwap depends on the official Freighter API (`frontend/package.json`):

```json
"dependencies": {
  "@stellar/freighter-api": "^4.1.0",
  "@stellar/stellar-sdk": "^13.1.0"
}
```

Every Freighter call is centralized in `frontend/src/lib/wallet.ts`:

```ts
import {
  isConnected as freighterIsConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api';
```

`WalletContext.tsx` (connect flow) and `soroban.ts` (signing) import the typed
wrappers from `wallet.ts` rather than calling Freighter directly.

---

## Requirement 2 — Functional "Connect Wallet" flow

The **Connect Wallet** button is rendered by `ConnectButton`
(`frontend/src/components/ConnectButton.tsx`) and wired to the `connect()` handler from
the wallet context:

```tsx
export function ConnectButton() {
  const { publicKey, network, isConnected, isConnecting, error, connect, disconnect } = useWallet();

  if (!isConnected) {
    return (
      <button onClick={connect} disabled={isConnecting}>
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }
  // connected → show shortened address, network status dot, and a Disconnect action
}
```

`connect()` (`frontend/src/context/WalletContext.tsx`) delegates to `connectWallet()` in
`lib/wallet.ts`, which detects the extension, requests access (opening Freighter's approval
popup), and returns the address + network:

```ts
// context/WalletContext.tsx
const connect = useCallback(async () => {
  const { address, network } = await connectWallet();   // lib/wallet.ts
  setPublicKey(address);
  setNetwork(network);
  localStorage.setItem(STORAGE_KEY, '1');
}, []);

// lib/wallet.ts
export async function connectWallet(): Promise<WalletConnection> {
  if (!(await isWalletInstalled())) {
    throw new Error('Freighter not detected. Install the Freighter extension and refresh.');
  }
  const access = await requestAccess();          // opens approval popup, returns address
  if (access.error) throw new Error('Connection rejected');
  const net = await getNetwork();
  return { address: access.address, network: net.network ?? null };
}
```

The provider is mounted app-wide in `frontend/src/app/layout.tsx`, and `<ConnectButton />`
appears in the navbar on every page.

---

## Requirement 3 — Permissions, address retrieval & transaction signing

**Permissions & address retrieval** — on reload, `getPermittedConnection()` in `lib/wallet.ts`
re-hydrates the session only if the user previously granted permission:

```ts
// lib/wallet.ts
export async function getPermittedConnection(): Promise<WalletConnection | null> {
  if (!(await isWalletInstalled())) return null;
  const allowed = await isAllowed();   // permission check
  if (!allowed.isAllowed) return null;
  const addr = await getAddress();     // address retrieval
  if (!addr.address) return null;
  const net = await getNetwork();
  return { address: addr.address, network: net.network ?? null };
}
```

`requestAccess()` (used in `connectWallet()`) implicitly grants allow-list permission;
`grantWalletPermission()` wraps `setAllowed` for explicit permission management.

**Transaction signing** — every on-chain action is built, simulated, then signed by Freighter
before submission via `signWithWallet()`. The app never touches the user's secret key:

```ts
// lib/wallet.ts
export async function signWithWallet(xdr: string, networkPassphrase: string, address: string): Promise<string> {
  const signed = await signTransaction(xdr, { networkPassphrase, address });
  if (signed.error) throw new Error('Transaction rejected in wallet');
  return signed.signedTxXdr;
}

// lib/soroban.ts — build + simulate, then sign + broadcast
const prepared = rpc.assembleTransaction(built, sim).build();
const signedXdr = await signWithWallet(prepared.toXDR(), NETWORK_PASSPHRASE, publicKey);
const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
await server.sendTransaction(signedTx);   // broadcast the wallet-signed transaction
```

This signing path backs every swap and add/remove-liquidity operation in the UI
(`frontend/src/components/swap/SwapWidget.tsx`, `frontend/src/components/pool/LiquidityWidget.tsx`).

---

## How to verify locally

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

1. Install the [Freighter](https://www.freighter.app/) browser extension and set it to **Testnet**.
2. Click **Connect Wallet** → approve in the Freighter popup → your address appears in the navbar.
3. Perform a swap → Freighter prompts you to **sign** the transaction → it is broadcast to Stellar Testnet.
