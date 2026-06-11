import express from 'express';
import cors from 'cors';
import pairsRouter from './routes/pairs';
import analyticsRouter from './routes/analytics';

export function createServer(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Routes
  app.use('/pairs', pairsRouter);
  app.use('/analytics', analyticsRouter);

  // 404 handler
  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  return app;
}
