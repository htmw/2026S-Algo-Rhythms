import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from './logger.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  logger.info({ port }, 'API server started');
});

export { app };
