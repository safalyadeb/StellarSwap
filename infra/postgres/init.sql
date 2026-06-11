-- StellarSwap Indexer Database Schema

CREATE TABLE IF NOT EXISTS pairs (
    id              TEXT PRIMARY KEY,           -- pair contract address
    token_x         TEXT NOT NULL,              -- token X address
    token_y         TEXT NOT NULL,              -- token Y address
    created_ledger  BIGINT NOT NULL,
    created_at      BIGINT NOT NULL             -- Unix timestamp
);

CREATE TABLE IF NOT EXISTS swaps (
    id              TEXT PRIMARY KEY,           -- event id (ledger:index)
    pair_id         TEXT NOT NULL REFERENCES pairs(id),
    caller          TEXT NOT NULL,
    token_in        TEXT NOT NULL,
    token_out       TEXT NOT NULL,
    amount_in       NUMERIC NOT NULL,
    amount_out      NUMERIC NOT NULL,
    ledger          BIGINT NOT NULL,
    ts              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS liquidity_events (
    id              TEXT PRIMARY KEY,
    pair_id         TEXT NOT NULL REFERENCES pairs(id),
    event_type      TEXT NOT NULL,              -- 'add' or 'remove'
    provider        TEXT NOT NULL,
    amount_x        NUMERIC NOT NULL,
    amount_y        NUMERIC NOT NULL,
    lp_amount       NUMERIC NOT NULL,
    ledger          BIGINT NOT NULL,
    ts              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS pair_snapshots (
    id              SERIAL PRIMARY KEY,
    pair_id         TEXT NOT NULL REFERENCES pairs(id),
    reserve_x       NUMERIC NOT NULL,
    reserve_y       NUMERIC NOT NULL,
    ledger          BIGINT NOT NULL,
    ts              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_state (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Seed indexer state
INSERT INTO indexer_state (key, value)
VALUES ('last_indexed_ledger', '0')
ON CONFLICT DO NOTHING;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS swaps_pair_id_idx ON swaps(pair_id);
CREATE INDEX IF NOT EXISTS swaps_ts_idx ON swaps(ts DESC);
CREATE INDEX IF NOT EXISTS liquidity_pair_id_idx ON liquidity_events(pair_id);
CREATE INDEX IF NOT EXISTS pair_snapshots_pair_ledger_idx ON pair_snapshots(pair_id, ledger DESC);
