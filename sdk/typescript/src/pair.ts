import { Contract, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { PoolInfo } from './types';

export class PairClient {
  private readonly contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
  }

  buildGetReserves() {
    return new Contract(this.contractId).call('get_reserves');
  }

  buildTokenX() {
    return new Contract(this.contractId).call('token_x');
  }

  buildTokenY() {
    return new Contract(this.contractId).call('token_y');
  }

  buildLpBalance(account: string) {
    return new Contract(this.contractId).call(
      'lp_balance',
      new Address(account).toScVal(),
    );
  }

  buildLpTotalSupply() {
    return new Contract(this.contractId).call('lp_total_supply');
  }

  buildLpApprove(from: string, spender: string, amount: bigint, expirationLedger: number) {
    return new Contract(this.contractId).call(
      'lp_approve',
      new Address(from).toScVal(),
      new Address(spender).toScVal(),
      nativeToScVal(amount, { type: 'i128' }),
      nativeToScVal(expirationLedger, { type: 'u32' }),
    );
  }
}
