import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// ── Schema types ──────────────────────────────────────────────────────────────

export interface DbPair {
  id: string;
  token_x: string;
  token_y: string;
  created_ledger: string;
  created_at: string;
}

export interface DbSwap {
  id: string;
  pair_id: string;
  caller: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  ledger: string;
  ts: string;
}

export interface DbLiquidityEvent {
  id: string;
  pair_id: string;
  event_type: 'add' | 'remove';
  provider: string;
  amount_x: string;
  amount_y: string;
  lp_amount: string;
  ledger: string;
  ts: string;
}

export interface DbPairSnapshot {
  id: number;
  pair_id: string;
  reserve_x: string;
  reserve_y: string;
  ledger: string;
  ts: string;
}

// ── Schema migration ──────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pairs (
  id             TEXT PRIMARY KEY,
  token_x        TEXT NOT NULL,
  token_y        TEXT NOT NULL,
  created_ledger BIGINT NOT NULL,
  created_at     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS swaps (
  id         TEXT PRIMARY KEY,
  pair_id    TEXT NOT NULL REFERENCES pairs(id),
  caller     TEXT NOT NULL,
  token_in   TEXT NOT NULL,
  token_out  TEXT NOT NULL,
  amount_in  NUMERIC NOT NULL,
  amount_out NUMERIC NOT NULL,
  ledger     BIGINT NOT NULL,
  ts         BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS liquidity_events (
  id         TEXT PRIMARY KEY,
  pair_id    TEXT NOT NULL REFERENCES pairs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('add','remove')),
  provider   TEXT NOT NULL,
  amount_x   NUMERIC NOT NULL,
  amount_y   NUMERIC NOT NULL,
  lp_amount  NUMERIC NOT NULL,
  ledger     BIGINT NOT NULL,
  ts         BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS pair_snapshots (
  id        SERIAL PRIMARY KEY,
  pair_id   TEXT NOT NULL REFERENCES pairs(id),
  reserve_x NUMERIC NOT NULL,
  reserve_y NUMERIC NOT NULL,
  ledger    BIGINT NOT NULL,
  ts        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO indexer_state (key, value)
VALUES ('last_indexed_ledger', '0')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS swaps_pair_idx ON swaps(pair_id);
CREATE INDEX IF NOT EXISTS swaps_ts_idx ON swaps(ts DESC);
CREATE INDEX IF NOT EXISTS liquidity_pair_idx ON liquidity_events(pair_id);
CREATE INDEX IF NOT EXISTS snapshots_pair_ledger_idx ON pair_snapshots(pair_id, ledger DESC);
`;

export async function migrate(): Promise<void> {
  console.log('[db] running migrations...');
  const client = await getPool().connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[db] migrations complete');
  } finally {
    client.release();
  }
}

export async function getLastIndexedLedger(): Promise<number> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM indexer_state WHERE key = 'last_indexed_ledger'",
  );
  return rows.length > 0 ? parseInt(rows[0].value, 10) : 0;
}

export async function setLastIndexedLedger(ledger: number): Promise<void> {
  await query(
    "INSERT INTO indexer_state (key, value) VALUES ('last_indexed_ledger', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [ledger.toString()],
  );
}
