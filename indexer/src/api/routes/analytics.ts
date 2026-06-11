import { Router } from 'express';
import { query } from '../../db/schema';

const router = Router();

// GET /analytics/tvl — current TVL across all pairs (sum of reserves)
router.get('/tvl', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT SUM(s.reserve_x::NUMERIC + s.reserve_y::NUMERIC) AS tvl
      FROM pairs p
      JOIN LATERAL (
        SELECT reserve_x, reserve_y
        FROM pair_snapshots
        WHERE pair_id = p.id
        ORDER BY ledger DESC LIMIT 1
      ) s ON true
    `);
    res.json({ tvl: rows[0]?.tvl ?? '0' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /analytics/volume/24h — swap volume in the last 24 hours
router.get('/volume/24h', async (_req, res) => {
  const since = Math.floor(Date.now() / 1000) - 86_400;
  try {
    const rows = await query(
      `SELECT SUM(amount_in::NUMERIC) AS volume
       FROM swaps WHERE ts >= $1`,
      [since],
    );
    res.json({ volume_24h: rows[0]?.volume ?? '0' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /analytics/swaps/24h — swap count in the last 24 hours
router.get('/swaps/24h', async (_req, res) => {
  const since = Math.floor(Date.now() / 1000) - 86_400;
  try {
    const [row] = await query(
      'SELECT COUNT(*) AS count FROM swaps WHERE ts >= $1',
      [since],
    );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /analytics/pairs/:id/apy — rough fee APY estimate
router.get('/pairs/:id/apy', async (req, res) => {
  const since = Math.floor(Date.now() / 1000) - 86_400;
  try {
    const [vol] = await query(
      'SELECT SUM(amount_in::NUMERIC) AS vol FROM swaps WHERE pair_id = $1 AND ts >= $2',
      [req.params.id, since],
    );
    const [snap] = await query(
      `SELECT reserve_x::NUMERIC + reserve_y::NUMERIC AS tvl
       FROM pair_snapshots WHERE pair_id = $1 ORDER BY ledger DESC LIMIT 1`,
      [req.params.id],
    );

    const volume24h = parseFloat(vol?.vol ?? '0');
    const tvl = parseFloat(snap?.tvl ?? '1');
    const dailyFees = volume24h * 0.003;
    const apy = tvl > 0 ? (dailyFees / tvl) * 365 * 100 : 0;

    res.json({ apy: apy.toFixed(2), volume_24h: volume24h, tvl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
