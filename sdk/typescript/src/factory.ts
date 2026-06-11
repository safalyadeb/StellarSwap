import { Contract, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { NetworkConfig } from './types';

export class FactoryClient {
  private readonly contractId: string;
  private readonly config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.contractId = config.contracts.factory;
    this.config = config;
  }

  buildGetPair(tokenA: string, tokenB: string) {
    const contract = new Contract(this.contractId);
    return contract.call(
      'get_pair',
      new Address(tokenA).toScVal(),
      new Address(tokenB).toScVal(),
    );
  }

  buildCreatePair(tokenA: string, tokenB: string) {
    const contract = new Contract(this.contractId);
    return contract.call(
      'create_pair',
      new Address(tokenA).toScVal(),
      new Address(tokenB).toScVal(),
    );
  }

  buildAllPairsLength() {
    return new Contract(this.contractId).call('all_pairs_length');
  }
}
