import 'dotenv/config';
import { migrate } from './db/schema';
import { startIndexer } from './horizon';
import { createServer } from './api/server';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const RPC_URL = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';

async function main() {
  // 1. Run DB migrations
  await migrate();

  // 2. Load contract config
  const configPath = process.env.CONFIG_PATH ?? '../config/testnet.json';
  const config = require(configPath);
  const factoryAddress: string = config.contracts.factory;
  const pairAddresses: string[] = Object.values(config.pairs ?? {}) as string[];

  if (!factoryAddress) {
    console.warn('[indexer] no factory address in config — events won\'t be indexed');
  }

  // 3. Start event indexer (non-blocking)
  if (factoryAddress) {
    startIndexer(RPC_URL, factoryAddress, pairAddresses).catch(console.error);
  }

  // 4. Start REST API server
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`[api] StellarSwap indexer running on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
