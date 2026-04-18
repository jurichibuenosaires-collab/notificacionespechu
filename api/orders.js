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

  // POST - marcar pedido como entregado
  if (req.method === 'POST') {
    const { orderId, action } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId requerido' });

    try {
      if (action === 'fulfill') {
        // Paso 1: obtener la primera location de la tienda
        const locRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/locations.json`,
          { headers: { 'X-Shopify-Access-Token': TOKEN } }
        );
        const locData = await locRes.json();
        const locationId = locData.locations?.[0]?.id;

        // Paso 2: obtener fulfillment_orders del pedido
        const foRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
          { headers: { 'X-Shopify-Access-Token': TOKEN } }
        );

        if (!foRes.ok) {
          const txt = await foRes.text();
          return res.status(foRes.status).json({ error: txt });
        }

        const foData = await foRes.json();
        const openOrders = (foData.fulfillment_orders || []).filter(fo => fo.status === 'open');

        if (openOrders.length === 0) {
          return res.status(200).json({ ok: true, msg: 'No hay fulfillment orders abiertas' });
        }

        // Paso 3: crear fulfillment
        const body = {
          fulfillment: {
            notify_customer: false,
            line_items_by_fulfillment_order: openOrders.map(fo => ({
              fulfillment_order_id: fo.id
            }))
          }
        };

        if (locationId) {
          body.fulfillment.location_id = locationId;
        }

        const fulfillRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/fulfillments.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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

  // GET - traer solo pedidos pendientes de entrega
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
