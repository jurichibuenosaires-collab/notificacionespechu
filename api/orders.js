export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SHOP = 'pechufreeglutenfree.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!TOKEN) {
    return res.status(500).json({ error: 'Token no configurado' });
  }

  if (req.method === 'POST') {
    const { orderId, action } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId requerido' });

    try {
      if (action === 'fulfill') {
        const orderRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/orders/${orderId}.json`,
          { headers: { 'X-Shopify-Access-Token': TOKEN } }
        );
        const orderData = await orderRes.json();
        const order = orderData.order;

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        const fulfillRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fulfillment: {
                notify_customer: false,
                line_items: order.line_items.map(i => ({ id: i.id }))
              }
            }),
          }
        );

        const fulfillData = await fulfillRes.json();
        if (!fulfillRes.ok) {
          return res.status(fulfillRes.status).json({ error: JSON.stringify(fulfillData) });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2024-01/orders.json?status=open&fulfillment_status=unfulfilled&limit=50`,
      { headers: { 'X-Shopify-Access-Token': TOKEN } }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
