import { Router } from 'express';
import { createSubscriptionCheckoutSession, stripe } from '../lib/billing/stripe';

export const billingRouter = Router();

// POST /api/billing/checkout/subscription
billingRouter.post('/checkout/subscription', async (req, res) => {
  try {
    const { userId } = req.body as { userId?: number };

    if (!userId) {
      return res.status(400).json({ message: 'userId é obrigatório.' });
    }

    const priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ message: 'Preço de assinatura do Stripe não configurado no servidor.' });
    }

    const successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/cliente?status=success';
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/cliente?status=cancelled';

    const session = await createSubscriptionCheckoutSession({
      userId,
      priceId,
      successUrl,
      cancelUrl,
    });

    return res.status(201).json({ url: session.url });
  } catch (error) {
    console.error('Erro ao criar sessão de checkout Stripe:', error);
    return res.status(500).json({ message: 'Erro ao criar sessão de pagamento.' });
  }
});

// POST /api/billing/checkout/payment
// Pagamento avulso com Pix + cartão
billingRouter.post('/checkout/payment', async (req, res) => {
  try {
    const { userId } = req.body as { userId?: number };

    const priceId = process.env.STRIPE_ONE_TIME_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ message: 'Preço único do Stripe (STRIPE_ONE_TIME_PRICE_ID) não configurado no servidor.' });
    }

    const successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/cliente?status=success';
    const cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/cliente?status=cancelled';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      payment_method_types: ['card', 'pix'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: userId ? { userId: String(userId) } : undefined,
    });

    return res.status(201).json({ url: session.url });
  } catch (error) {
    console.error('Erro ao criar sessão de pagamento único Stripe:', error);
    return res.status(500).json({ message: 'Erro ao criar sessão de pagamento único.' });
  }
});
