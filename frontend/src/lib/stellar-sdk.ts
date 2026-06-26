import * as StellarSdk from '@stellar/stellar-sdk';
import { rpc, Networks } from '@stellar/stellar-sdk';

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export const networkPassphrase =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;

export const server = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: true });

export { StellarSdk };
