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

  // ── POST: marcar pedido como listo para entregar ──────────────────────────
  if (req.method === 'POST') {
    const { orderId, action } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId requerido' });

    try {
      if (action === 'fulfill') {

        // 1. Obtener fulfillment orders de esta orden
        const foRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
          { headers: { 'X-Shopify-Access-Token': TOKEN } }
        );
        if (!foRes.ok) {
          const txt = await foRes.text();
          return res.status(foRes.status).json({ error: `Error obteniendo fulfillment orders: ${txt}` });
        }
        const foData = await foRes.json();
        const fulfillmentOrders = foData.fulfillment_orders || [];

        // 2. Obtener la primera ubicación activa de la tienda
        const locRes = await fetch(
          `https://${SHOP}/admin/api/2024-01/locations.json`,
          { headers: { 'X-Shopify-Access-Token': TOKEN } }
        );
        if (!locRes.ok) {
          const txt = await locRes.text();
          return res.status(locRes.status).json({ error: `Error obteniendo ubicaciones: ${txt}` });
        }
        const locData = await locRes.json();
        const location = (locData.locations || []).find(l => l.active);
        if (!location) {
          return res.status(500).json({ error: 'No se encontró ninguna ubicación activa en la tienda' });
        }

        // 3. Fulfillment por cada fulfillment_order abierto
        for (const fo of fulfillmentOrders) {
          if (fo.status === 'open') {
            const fulfillRes = await fetch(
              `https://${SHOP}/admin/api/2024-01/fulfillments.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': TOKEN,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  fulfillment: {
                    location_id: location.id,
                    notify_customer: false,
                    line_items_by_fulfillment_order: [
                      { fulfillment_order_id: fo.id }
                    ]
                  }
                }),
              }
            );

            // Si Shopify rechaza el fulfillment, devolver el error real
            if (!fulfillRes.ok) {
              const errorBody = await fulfillRes.json().catch(() => ({}));
              return res.status(fulfillRes.status).json({
                error: `Shopify rechazó el fulfillment (${fulfillRes.status})`,
                details: errorBody
              });
            }
          }
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: traer pedidos pendientes ─────────────────────────────────────────
  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2024-01/orders.json?status=open&fulfillment_status=unfulfilled&financial_status=any&limit=50`,
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
