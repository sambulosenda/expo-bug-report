import Stripe from 'stripe';
import type { Env } from './types';

type Plan = 'free' | 'starter' | 'pro' | 'beta';

const PLAN_MAP: Record<string, Plan> = {
  // Map Stripe price IDs to plan names (set these in env or hardcode)
  starter_monthly: 'starter',
  pro_monthly: 'pro',
};

const GRACE_PERIOD_DAYS = 7;

export async function handleStripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('Stripe-Signature');

  if (!signature) {
    return json({ error: 'missing_signature' }, 400);
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return json({ error: 'invalid_signature' }, 401);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_email;
      const customerId = session.customer as string;

      if (email) {
        const plan = getPlanFromSession(session);

        // Try to update existing user first
        const updateResult = await env.DB.prepare(
          'UPDATE users SET stripe_customer_id = ?, plan = ?, grace_expires_at = NULL WHERE email = ?',
        ).bind(customerId, plan, email).run();

        // If no user exists (paid before signup), create the account
        if ((updateResult.meta.changes ?? 0) === 0) {
          const id = crypto.randomUUID();
          const apiKey = `bp_${crypto.randomUUID().replace(/-/g, '')}`;
          const hmacSecret = `bps_${crypto.randomUUID().replace(/-/g, '')}`;
          const insertResult = await env.DB.prepare(
            'INSERT OR IGNORE INTO users (id, email, api_key, hmac_secret, stripe_customer_id, plan) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(id, email, apiKey, hmacSecret, customerId, plan).run();

          // Race: if signup happened between UPDATE and INSERT, INSERT was ignored.
          // Retry the UPDATE to ensure the plan is applied.
          if ((insertResult.meta.changes ?? 0) === 0) {
            await env.DB.prepare(
              'UPDATE users SET stripe_customer_id = ?, plan = ?, grace_expires_at = NULL WHERE email = ?',
            ).bind(customerId, plan, email).run();
          }
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const plan = getPlanFromSubscription(subscription);

      await env.DB.prepare(
        'UPDATE users SET plan = ?, grace_expires_at = NULL WHERE stripe_customer_id = ?',
      ).bind(plan, customerId).run();
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      await env.DB.prepare(
        'UPDATE users SET plan = ?, grace_expires_at = NULL WHERE stripe_customer_id = ?',
      ).bind('free', customerId).run();
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const graceExpiry = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Set grace period — don't downgrade yet
      await env.DB.prepare(
        'UPDATE users SET grace_expires_at = ? WHERE stripe_customer_id = ? AND grace_expires_at IS NULL',
      ).bind(graceExpiry, customerId).run();
      break;
    }

    default:
      // Unhandled event types are fine — return 200 to prevent retries
      break;
  }

  return json({ received: true });
}

function getPlanFromSession(session: Stripe.Checkout.Session): Plan {
  // Extract plan from session metadata or line items
  const planName = session.metadata?.plan;
  if (planName && planName in PLAN_MAP) return PLAN_MAP[planName]!;
  return 'starter'; // default for checkout
}

function getPlanFromSubscription(subscription: Stripe.Subscription): Plan {
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? '';

  // Check metadata first
  const planName = subscription.metadata?.plan;
  if (planName && planName in PLAN_MAP) return PLAN_MAP[planName]!;

  // Fallback: check price lookup key
  const lookupKey = item?.price.lookup_key;
  if (lookupKey && lookupKey in PLAN_MAP) return PLAN_MAP[lookupKey]!;

  // Default based on status
  if (subscription.status === 'active') return 'starter';
  return 'free';
}

/**
 * Check if a user's grace period has expired. Called by cron.
 */
export async function expireGracePeriods(env: Env): Promise<number> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    'UPDATE users SET plan = ?, grace_expires_at = NULL WHERE grace_expires_at IS NOT NULL AND grace_expires_at < ?',
  ).bind('free', now).run();

  return result.meta.changes ?? 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
