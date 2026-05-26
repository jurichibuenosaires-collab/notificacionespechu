import webpush from 'web-push';

const subs = global.pushSubscriptions = global.pushSubscriptions || [];

webpush.setVapidDetails(
  'mailto:pechu@pechufree.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verificar que viene de Shopify (HMAC opcional por ahora)
  const order = req.body;
  if (!order || !order.order_number) return res.status(400).end();

  const customer = order.shipping_address?.first_name
    || order.billing_address?.first_name
    || order.email?.split('@')[0]
    || 'Cliente';

  const items = (order.line_items || [])
    .map(i => `${i.quantity}× ${i.name}`)
    .join(', ');

  const payload = JSON.stringify({
    title: `🔔 Nuevo pedido #${order.order_number}`,
    body: `${customer} — ${items}`,
    url: 'https://notificacionespechu.vercel.app'
  });

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub, payload))
  );

  const ok = results.filter(r => r.status === 'fulfilled').length;
  return res.status(200).json({ ok, total: subs.length });
}
