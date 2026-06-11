import { query } from '../db/schema';

export interface LiquidityAddedData {
  provider: string;
  amount_x: string;
  amount_y: string;
  lp_minted: string;
}

export interface LiquidityRemovedData {
  provider: string;
  amount_x: string;
  amount_y: string;
  lp_burned: string;
}

export async function processLiquidityAdded(
  eventId: string,
  pairId: string,
  data: LiquidityAddedData,
  ledger: number,
  ts: number,
): Promise<void> {
  await query(
    `INSERT INTO liquidity_events
     (id, pair_id, event_type, provider, amount_x, amount_y, lp_amount, ledger, ts)
     VALUES ($1, $2, 'add', $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [eventId, pairId, data.provider, data.amount_x, data.amount_y, data.lp_minted, ledger, ts],
  );
  console.log(`[liq+] pair=${pairId.slice(0, 8)} lp=${data.lp_minted}`);
}

export async function processLiquidityRemoved(
  eventId: string,
  pairId: string,
  data: LiquidityRemovedData,
  ledger: number,
  ts: number,
): Promise<void> {
  await query(
    `INSERT INTO liquidity_events
     (id, pair_id, event_type, provider, amount_x, amount_y, lp_amount, ledger, ts)
     VALUES ($1, $2, 'remove', $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [eventId, pairId, data.provider, data.amount_x, data.amount_y, data.lp_burned, ledger, ts],
  );
  console.log(`[liq-] pair=${pairId.slice(0, 8)} lp=${data.lp_burned}`);
}
