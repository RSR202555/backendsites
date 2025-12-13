import { Router } from 'express';
import { MercadoPagoConfig, Preference } from 'mercadopago';

if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
  console.warn('MERCADO_PAGO_ACCESS_TOKEN não configurado no .env do backend.');
}

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
});

const preferenceClient = new Preference(mpClient);

export const paymentsRouter = Router();

// POST /api/payments/create-preference
paymentsRouter.post('/create-preference', async (req, res) => {
  try {
    const { title, quantity, unitPrice } = req.body as {
      title?: string;
      quantity?: number;
      unitPrice?: number;
    };

    const finalTitle = title || 'Pagamento de assinatura';
    const finalQuantity = quantity ?? 1;
    const finalUnitPrice = unitPrice ?? 1; // R$ 1,00 para testes

    const preferenceBody = {
      items: [
        {
          title: finalTitle,
          quantity: finalQuantity,
          currency_id: 'BRL',
          unit_price: finalUnitPrice,
        },
      ],
      back_urls: {
        success: process.env.MP_SUCCESS_URL || 'http://localhost:3000/cliente?status=success',
        failure: process.env.MP_FAILURE_URL || 'http://localhost:3000/cliente?status=failure',
        pending: process.env.MP_PENDING_URL || 'http://localhost:3000/cliente?status=pending',
      },
    };

    const response = await preferenceClient.create({ body: preferenceBody });

    const initPoint = (response as any).init_point || (response as any).sandbox_init_point;

    if (!initPoint) {
      return res.status(500).json({ message: 'Mercado Pago não retornou uma URL de checkout (init_point).' });
    }

    return res.status(201).json({ init_point: initPoint });
  } catch (error) {
    console.error('Erro ao criar preferência de pagamento Mercado Pago:', error);
    return res.status(500).json({ message: 'Erro ao iniciar pagamento com Mercado Pago.' });
  }
});
