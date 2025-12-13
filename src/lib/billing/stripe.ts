import Stripe from 'stripe';
import { prisma } from '../prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export async function createStripeCustomerIfNeeded(userId: number, email: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId },
  });

  if (sub?.stripeCustomerId) {
    return sub.stripeCustomerId;
  }

  const customer = await stripe.customers.create({ email });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  return customer.id;
}

export async function createSubscriptionCheckoutSession(params: {
  userId: number;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) throw new Error('User not found');

  const customerId = await createStripeCustomerIfNeeded(params.userId, user.email);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return session;
}

export { stripe };
