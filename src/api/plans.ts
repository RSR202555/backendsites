import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const plansRouter = Router();

// GET /api/plans
plansRouter.get('/', async (_req, res) => {
  const plans = await prisma.plan.findMany();
  res.json(plans);
});

// POST /api/plans (ADMIN) - aqui futuramente vamos validar token e role
plansRouter.post('/', async (req, res) => {
  const { name, priceCents, description, periodicity, siteLimit } = req.body;

  const plan = await prisma.plan.create({
    data: {
      name,
      priceCents,
      description,
      periodicity,
      siteLimit,
    },
  });

  res.status(201).json(plan);
});
