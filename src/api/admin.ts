import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const adminRouter = Router();

function parseBrDate(value: string): Date | null {
  if (!value) return null;

  const parts = value.split('/');

  if (parts.length === 3) {
    const [dayStr, monthStr, yearStr] = parts;
    const day = Number(dayStr);
    const month = Number(monthStr);
    const year = Number(yearStr);

    if (!day || !month || !year) return null;

    const d = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  const [isoDatePart] = value.split('T');
  const isoParts = isoDatePart.split('-');

  if (isoParts.length === 3) {
    const [yearStr, monthStr, dayStr] = isoParts;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (!day || !month || !year) return null;

    const d = new Date(year, month - 1, day, 12, 0, 0, 0);

    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

// POST /api/admin/clients
// Cria um usuário CLIENT (se não existir), um site associado e opcionalmente uma assinatura inicial
adminRouter.post('/clients', async (req, res) => {
  const { name, email, siteUrl, planName, firstDueDate } = req.body as {
    name?: string;
    email?: string;
    siteUrl?: string;
    planName?: string;
    firstDueDate?: string;
  };

  if (!email || !siteUrl) {
    return res.status(400).json({ message: 'E-mail e URL do site são obrigatórios.' });
  }

  try {
    // Garante usuário
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          externalId: `admin-created-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: name ?? null,
          role: 'CLIENT',
        },
      });
    }

    // Cria site básico vinculado ao usuário
    const site = await prisma.site.create({
      data: {
        userId: user.id,
        url: siteUrl,
        status: 'ACTIVE',
      },
    });

    // Se vier uma data de vencimento, cria uma assinatura inicial simples
    if (firstDueDate) {
      try {
        let plan = await prisma.plan.findFirst();

        if (!plan) {
          plan = await prisma.plan.create({
            data: {
              name: 'Plano Mensal Padrão',
              priceCents: 100,
              description: 'Plano padrão criado automaticamente.',
              periodicity: 'MONTHLY',
            },
          });
        }

        const dueDate = parseBrDate(firstDueDate);

        if (dueDate) {
          await prisma.subscription.create({
            data: {
              userId: user.id,
              planId: plan.id,
              status: 'ACTIVE',
              currentPeriodEnd: dueDate,
            },
          });
        }
      } catch (subErr) {
        console.error('Erro ao criar assinatura inicial do cliente admin:', subErr);
        // segue fluxo mesmo assim, pois o cadastro principal foi criado
      }
    }

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      site: site.url,
      siteId: site.id,
      plan: planName ?? 'Plano Mensal',
      status: site.status === 'ACTIVE' ? 'ativo' : 'bloqueado',
    });
  } catch (error) {
    console.error('Erro ao cadastrar cliente admin:', error);
    return res.status(500).json({ message: 'Erro ao cadastrar cliente.' });
  }
});

// DELETE /api/admin/clients/:userId
// Exclui um cliente e todos os dados relacionados (sites, assinaturas, pagamentos)
adminRouter.delete('/clients/:userId', async (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'userId inválido.' });
  }

  try {
    // Busca todas as assinaturas do usuário
    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      select: { id: true },
    });

    const subscriptionIds = subscriptions.map((s) => s.id);

    if (subscriptionIds.length > 0) {
      // Remove pagamentos ligados às assinaturas
      await prisma.payment.deleteMany({
        where: { subscriptionId: { in: subscriptionIds } },
      });

      // Remove assinaturas
      await prisma.subscription.deleteMany({
        where: { id: { in: subscriptionIds } },
      });
    }

    // Remove sites do usuário
    await prisma.site.deleteMany({ where: { userId } });

    // Remove o usuário em si
    await prisma.user.delete({ where: { id: userId } });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir cliente admin:', error);
    return res.status(500).json({ message: 'Erro ao excluir cliente.' });
  }
});

// GET /api/admin/overview
// Retorna resumo financeiro do mês atual (total esperado, recebido e pendente)
adminRouter.get('/overview', async (_req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'PENDING', 'SUSPENDED'],
        },
      },
      include: {
        plan: true,
        payments: true,
      },
    });

    let totalExpectedCents = 0;
    let totalReceivedCents = 0;

    for (const sub of subscriptions) {
      if (!sub.plan) continue;

      const amountCents = sub.plan.priceCents;

      // Consideramos que cada assinatura gera 1 cobrança por mês
      // Verifica se há pagamento PAGO neste mês
      const paidThisMonth = sub.payments.some((p) => {
        if (p.status !== 'PAID') return false;
        const d = new Date(p.paidAt ?? p.createdAt);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      });

      totalExpectedCents += amountCents;
      if (paidThisMonth) {
        totalReceivedCents += amountCents;
      }
    }

    const totalPendingCents = totalExpectedCents - totalReceivedCents;

    return res.json({
      month: currentMonth + 1,
      year: currentYear,
      totalExpectedCents,
      totalReceivedCents,
      totalPendingCents,
      activeSubscriptions: subscriptions.length,
    });
  } catch (error) {
    console.error('Erro ao carregar overview admin:', error);
    return res.status(500).json({ message: 'Erro ao carregar resumo financeiro.' });
  }
});

// GET /api/admin/clients
adminRouter.get('/clients', async (_req, res) => {
  try {
    const sites = await prisma.site.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = sites.map((site) => ({
      id: site.user.id,
      name: site.user.name ?? site.user.email,
      email: site.user.email,
      site: site.url,
      status: site.status === 'ACTIVE' ? 'ativo' : 'bloqueado',
      plan: 'Plano Mensal',
      siteId: site.id,
    }));

    return res.json({ clients: result });
  } catch (error) {
    console.error('Erro ao listar clientes admin:', error);
    return res.status(500).json({ message: 'Erro ao carregar clientes.' });
  }
});

// PATCH /api/admin/clients/:userId/due-date
adminRouter.patch('/clients/:userId/due-date', async (req, res) => {
  const userId = Number(req.params.userId);
  const { dueDate } = req.body as { dueDate?: string };

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'userId inválido.' });
  }

  if (!dueDate) {
    return res.status(400).json({ message: 'dueDate é obrigatório.' });
  }

  const parsed = parseBrDate(dueDate);

  if (!parsed) {
    return res.status(400).json({ message: 'Data de vencimento inválida.' });
  }

  try {
    let subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      let plan = await prisma.plan.findFirst();

      if (!plan) {
        plan = await prisma.plan.create({
          data: {
            name: 'Plano Mensal Padrão',
            priceCents: 100,
            description: 'Plano padrão criado automaticamente.',
            periodicity: 'MONTHLY',
          },
        });
      }

      subscription = await prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: parsed,
        },
      });

      return res.json({
        id: subscription.id,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodEnd: parsed },
    });

    return res.json({
      id: updated.id,
      currentPeriodEnd: updated.currentPeriodEnd,
    });
  } catch (error) {
    console.error('Erro ao atualizar data de vencimento do cliente:', error);
    return res.status(500).json({ message: 'Erro ao atualizar data de vencimento.' });
  }
});

// GET /api/admin/clients/:userId/payments
// Retorna uma visão de mensalidades (passadas e futuras) para o cliente
adminRouter.get('/clients/:userId/payments', async (req, res) => {
  const userId = Number(req.params.userId);

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'userId inválido.' });
  }

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        payments: true,
      },
    });

    if (!subscription || !subscription.plan) {
      return res.json({ payments: [] });
    }

    const now = new Date();
    const baseDueDate = new Date(subscription.currentPeriodEnd);
    const amountCents = subscription.plan.priceCents;

    // Vamos gerar todas as mensalidades do ano do currentPeriodEnd (ex.: 2026)
    const targetYear = baseDueDate.getFullYear();
    const dayOfMonth = baseDueDate.getDate();

    const schedule = Array.from({ length: 12 }).map((_, index) => {
      const monthIndex = index; // 0 = janeiro ... 11 = dezembro
      const dueDate = new Date(targetYear, monthIndex, dayOfMonth);

      // Encontra pagamento real ligado a este período (mes/ano iguais)
      const paymentForMonth = subscription.payments.find((p) => {
        const paidAtOrCreated = p.paidAt ?? p.createdAt;
        const d = new Date(paidAtOrCreated);
        return d.getFullYear() === dueDate.getFullYear() && d.getMonth() === dueDate.getMonth();
      });

      let status: 'PAID' | 'PENDING' | 'LATE' = 'PENDING';
      if (paymentForMonth && paymentForMonth.status === 'PAID') {
        status = 'PAID';
      } else if (dueDate < now) {
        status = 'LATE';
      }

      return {
        id: paymentForMonth ? paymentForMonth.id : Number(`${subscription.id}${index}`),
        amountCents,
        status,
        paidAt: paymentForMonth?.paidAt ?? null,
        createdAt: dueDate,
        provider: paymentForMonth?.provider ?? 'SCHEDULE',
      };
    });

    // Ordena por data de vencimento (createdAt)
    schedule.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return res.json({ payments: schedule });
  } catch (error) {
    console.error('Erro ao listar pagamentos do cliente:', error);
    return res.status(500).json({ message: 'Erro ao carregar pagamentos do cliente.' });
  }
});

// POST /api/admin/clients/:userId/payments/manual-pay
// Marca uma mensalidade como PAGA manualmente (cria ou atualiza o Payment do mês/ano da referência)
adminRouter.post('/clients/:userId/payments/manual-pay', async (req, res) => {
  const userId = Number(req.params.userId);
  const { referenceDate, paidAt } = req.body as {
    referenceDate?: string;
    paidAt?: string;
  };

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: 'userId inválido.' });
  }

  if (!referenceDate) {
    return res.status(400).json({ message: 'referenceDate é obrigatório.' });
  }

  const ref = new Date(referenceDate);
  if (Number.isNaN(ref.getTime())) {
    return res.status(400).json({ message: 'referenceDate inválido.' });
  }

  const paidAtDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(paidAtDate.getTime())) {
    return res.status(400).json({ message: 'paidAt inválido.' });
  }

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        payments: true,
      },
    });

    if (!subscription || !subscription.plan) {
      return res.status(404).json({ message: 'Assinatura não encontrada para este cliente.' });
    }

    const refYear = ref.getFullYear();
    const refMonth = ref.getMonth();

    const existing = subscription.payments.find((p) => {
      const d = new Date(p.paidAt ?? p.createdAt);
      return d.getFullYear() === refYear && d.getMonth() === refMonth;
    });

    if (existing) {
      const updated = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: 'PAID',
          provider: 'MANUAL' as any,
          paidAt: paidAtDate,
          rawPayload: {
            ...((existing.rawPayload && typeof existing.rawPayload === 'object'
              ? (existing.rawPayload as object)
              : {}) as object),
            manual: true,
            referenceDate,
            markedAt: new Date().toISOString(),
          },
        },
      });

      return res.json({ payment: updated });
    }

    const created = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amountCents: subscription.plan.priceCents,
        paidAt: paidAtDate,
        status: 'PAID',
        provider: 'MANUAL' as any,
        transactionId: `manual-${subscription.id}-${refYear}-${refMonth + 1}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        rawPayload: {
          manual: true,
          referenceDate,
          markedAt: new Date().toISOString(),
        },
      },
    });

    return res.status(201).json({ payment: created });
  } catch (error) {
    console.error('Erro ao marcar pagamento manualmente:', error);

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message)
        : '';

    if (
      errorMessage.toLowerCase().includes('paymentprovider') ||
      errorMessage.toLowerCase().includes('invalid enum') ||
      errorMessage.toLowerCase().includes('enum')
    ) {
      return res.status(500).json({
        message:
          'Falha ao marcar pagamento manualmente: banco de dados provavelmente sem migração do enum PaymentProvider (valor MANUAL). Rode as migrações do Prisma no servidor e tente novamente.',
      });
    }

    return res.status(500).json({ message: 'Erro ao marcar pagamento manualmente.' });
  }
});

adminRouter.post('/sites/:id/block', async (req, res) => {
  const id = Number(req.params.id);

  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ message: 'ID inválido.' });
  }

  try {
    const site = await prisma.site.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    return res.json(site);
  } catch (error) {
    console.error('Erro ao bloquear site:', error);
    return res.status(500).json({ message: 'Erro ao bloquear site.' });
  }
});

adminRouter.post('/sites/:id/unblock', async (req, res) => {
  const id = Number(req.params.id);

  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ message: 'ID inválido.' });
  }

  try {
    const site = await prisma.site.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    return res.json(site);
  } catch (error) {
    console.error('Erro ao desbloquear site:', error);
    return res.status(500).json({ message: 'Erro ao desbloquear site.' });
  }
});
