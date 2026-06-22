// Unit tests for the Stellar wallet (Freighter) integration layer.
// The official `@stellar/freighter-api` is mocked so we can assert the
// connect / permission / address-retrieval / signing flow in isolation.

import {
  isWalletInstalled,
  connectWallet,
  getPermittedConnection,
  signWithWallet,
  grantWalletPermission,
} from '../wallet';

jest.mock('@stellar/freighter-api', () => ({
  isConnected: jest.fn(),
  isAllowed: jest.fn(),
  setAllowed: jest.fn(),
  requestAccess: jest.fn(),
  getAddress: jest.fn(),
  getNetwork: jest.fn(),
  signTransaction: jest.fn(),
}));

import * as freighter from '@stellar/freighter-api';

const ADDR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const mocked = freighter as jest.Mocked<typeof freighter>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isWalletInstalled', () => {
  it('returns true when the Freighter extension is detected', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: true });
    await expect(isWalletInstalled()).resolves.toBe(true);
  });

  it('returns false when Freighter is not installed', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: false });
    await expect(isWalletInstalled()).resolves.toBe(false);
  });
});

describe('connectWallet (Connect Wallet flow)', () => {
  it('requests access and returns the address + network', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: true });
    mocked.requestAccess.mockResolvedValue({ address: ADDR });
    mocked.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'x' } as any);

    await expect(connectWallet()).resolves.toEqual({ address: ADDR, network: 'TESTNET' });
    expect(mocked.requestAccess).toHaveBeenCalledTimes(1);
  });

  it('throws a helpful error when Freighter is not installed', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: false });
    await expect(connectWallet()).rejects.toThrow(/Freighter not detected/);
  });

  it('throws when the user rejects the access request', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: true });
    mocked.requestAccess.mockResolvedValue({ address: '', error: 'User declined access' } as any);
    await expect(connectWallet()).rejects.toThrow(/User declined access/);
  });
});

describe('grantWalletPermission', () => {
  it('delegates to Freighter setAllowed', async () => {
    mocked.setAllowed.mockResolvedValue({ isAllowed: true } as any);
    await grantWalletPermission();
    expect(mocked.setAllowed).toHaveBeenCalledTimes(1);
  });
});

describe('getPermittedConnection (permission + address retrieval)', () => {
  it('returns the address when installed and allowed', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: true });
    mocked.isAllowed.mockResolvedValue({ isAllowed: true });
    mocked.getAddress.mockResolvedValue({ address: ADDR });
    mocked.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'x' } as any);

    await expect(getPermittedConnection()).resolves.toEqual({ address: ADDR, network: 'TESTNET' });
  });

  it('returns null when the app has not been granted permission', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: true });
    mocked.isAllowed.mockResolvedValue({ isAllowed: false });
    await expect(getPermittedConnection()).resolves.toBeNull();
    expect(mocked.getAddress).not.toHaveBeenCalled();
  });

  it('returns null when Freighter is not installed', async () => {
    mocked.isConnected.mockResolvedValue({ isConnected: false });
    await expect(getPermittedConnection()).resolves.toBeNull();
  });
});

describe('signWithWallet (transaction signing)', () => {
  it('returns the signed XDR', async () => {
    mocked.signTransaction.mockResolvedValue({ signedTxXdr: 'SIGNED_XDR', signerAddress: ADDR } as any);
    await expect(signWithWallet('UNSIGNED_XDR', 'Test SDF Network ; September 2015', ADDR)).resolves.toBe(
      'SIGNED_XDR',
    );
    expect(mocked.signTransaction).toHaveBeenCalledWith('UNSIGNED_XDR', {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address: ADDR,
    });
  });

  it('throws when the user rejects the signature', async () => {
    mocked.signTransaction.mockResolvedValue({ signedTxXdr: '', error: 'rejected' } as any);
    await expect(signWithWallet('UNSIGNED_XDR', 'passphrase', ADDR)).rejects.toThrow(
      /Transaction rejected in wallet/,
    );
  });

  it('uses a custom rejection message when provided', async () => {
    mocked.signTransaction.mockResolvedValue({ signedTxXdr: '', error: 'rejected' } as any);
    await expect(signWithWallet('XDR', 'passphrase', ADDR, 'Trustline setup rejected in wallet')).rejects.toThrow(
      /Trustline setup rejected/,
    );
  });
});
