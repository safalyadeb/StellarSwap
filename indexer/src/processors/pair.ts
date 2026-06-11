import { query } from '../db/schema';

export interface PairCreatedData {
  token_x: string;
  token_y: string;
  pair: string;
  pair_index: number;
}

export async function processPairCreated(
  pairId: string,
  data: PairCreatedData,
  ledger: number,
  ts: number,
): Promise<void> {
  await query(
    `INSERT INTO pairs (id, token_x, token_y, created_ledger, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [pairId, data.token_x, data.token_y, ledger, ts],
  );
  console.log(
    `[pair+] ${data.token_x.slice(0, 8)}/${data.token_y.slice(0, 8)} → ${pairId.slice(0, 8)}`,
  );
}
