import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const clientRouter = Router();

// GET /api/client/summary?userId=1
clientRouter.get('/summary', async (req, res) => {
  try {
    const userId = Number(req.query.userId ?? 1);

    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ message: 'userId inválido.' });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const site = await prisma.site.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (!subscription || !subscription.plan) {
      // Sem dados reais ainda: devolve um resumo mockado para ambiente de testes
      const now = new Date();
      const currentPeriodEnd = new Date(now);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 7);

      return res.json({
        planName: 'Plano de testes',
        priceCents: 100, // R$ 1,00 para testes
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd,
        lastPayment: null,
        siteUrl: site?.url ?? null,
      });
    }

    const lastPayment = subscription.payments[0] ?? null;

    return res.json({
      planName: subscription.plan.name,
      priceCents: subscription.plan.priceCents,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      siteUrl: site?.url ?? null,
      lastPayment: lastPayment
        ? {
            amountCents: lastPayment.amountCents,
            status: lastPayment.status,
            paidAt: lastPayment.paidAt,
            createdAt: lastPayment.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Erro ao carregar resumo do cliente:', error);
    return res.status(500).json({ message: 'Erro ao carregar informações do cliente.' });
  }
});
