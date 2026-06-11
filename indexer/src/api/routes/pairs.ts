import { Router } from 'express';
import { query } from '../../db/schema';

const router = Router();

// GET /pairs — list all pairs with reserve snapshots
router.get('/', async (_req, res) => {
  try {
    const pairs = await query(`
      SELECT p.*,
             s.reserve_x,
             s.reserve_y
      FROM pairs p
      LEFT JOIN LATERAL (
        SELECT reserve_x, reserve_y
        FROM pair_snapshots
        WHERE pair_id = p.id
        ORDER BY ledger DESC
        LIMIT 1
      ) s ON true
      ORDER BY p.created_ledger DESC
    `);
    res.json({ pairs });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /pairs/:id — single pair detail
router.get('/:id', async (req, res) => {
  try {
    const [pair] = await query(
      `SELECT p.*, s.reserve_x, s.reserve_y
       FROM pairs p
       LEFT JOIN LATERAL (
         SELECT reserve_x, reserve_y
         FROM pair_snapshots
         WHERE pair_id = p.id
         ORDER BY ledger DESC LIMIT 1
       ) s ON true
       WHERE p.id = $1`,
      [req.params.id],
    );
    if (!pair) return res.status(404).json({ error: 'pair not found' });

    const swaps = await query(
      'SELECT * FROM swaps WHERE pair_id = $1 ORDER BY ts DESC LIMIT 50',
      [req.params.id],
    );
    res.json({ pair, recent_swaps: swaps });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /pairs/:id/swaps — paginated swap history
router.get('/:id/swaps', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const offset = parseInt(req.query.offset as string || '0', 10);
  try {
    const swaps = await query(
      'SELECT * FROM swaps WHERE pair_id = $1 ORDER BY ts DESC LIMIT $2 OFFSET $3',
      [req.params.id, limit, offset],
    );
    res.json({ swaps });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
