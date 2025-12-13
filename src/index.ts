import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { plansRouter } from './api/plans';
import { authRouter } from './api/auth';
import { billingRouter } from './api/billing';
import { paymentsRouter } from './api/payments';
import { clientRouter } from './api/client';
import { adminRouter } from './api/admin';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/plans', plansRouter);
app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/client', clientRouter);
app.use('/api/admin', adminRouter);

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
