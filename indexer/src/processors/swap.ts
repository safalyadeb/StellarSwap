import { query } from '../db/schema';

export interface SwapEventData {
  from: string;
  amount_in: string;
  amount_out: string;
  token_in: string;
  token_out: string;
}

export async function processSwapEvent(
  eventId: string,
  pairId: string,
  data: SwapEventData,
  ledger: number,
  ts: number,
): Promise<void> {
  await query(
    `INSERT INTO swaps (id, pair_id, caller, token_in, token_out, amount_in, amount_out, ledger, ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      pairId,
      data.from,
      data.token_in,
      data.token_out,
      data.amount_in,
      data.amount_out,
      ledger,
      ts,
    ],
  );

  // Snapshot reserves after swap (via a separate reserve query in production)
  console.log(
    `[swap] pair=${pairId.slice(0, 8)} in=${data.amount_in} out=${data.amount_out}`,
  );
}
