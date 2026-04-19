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

  // POST: marcar pedido como listo para entregar
  if (req.method === 'POST') {
    const { orderId, action } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId requerido' });
    if (action !== 'fulfill') return res.status(200).json({ ok: true });

    try {
      // 1. Obtener los fulfillment_orders de la orden
      const foRes = await fetch(
        `https://${SHOP}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
        { headers: { 'X-Shopify-Access-Token': TOKEN } }
      );

      if (!foRes.ok) {
        const txt = await foRes.text();
        return res.status(foRes.status).json({ error: `Error obteniendo fulfillment orders: ${txt}` });
      }

      const foData = await foRes.json();
      const openFOs = (foData.fulfillment_orders || []).filter(fo => fo.status === 'open');

      if (openFOs.length === 0) {
        return res.status(200).json({ ok: true, message: 'No hay items pendientes' });
      }

      // 2. Crear el fulfillment con la estructura correcta para API 2024-01:
      //    Cada fulfillment_order DEBE incluir fulfillment_order_line_items
      //    con el id y quantity de cada line item del FO.
      const fulfillRes = await fetch(
        `https://${SHOP}/admin/api/2024-01/fulfillments.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fulfillment: {
              notify_customer: false,
              line_items_by_fulfillment_order: openFOs.map(fo => ({
                fulfillment_order_id: fo.id,
                fulfillment_order_line_items: (fo.line_items || []).map(li => ({
                  id: li.id,
                  quantity: li.remaining_quantity
                }))
              }))
            }
          })
        }
      );

      if (fulfillRes.ok) {
        return res.status(200).json({ ok: true });
      }

      const errorBody = await fulfillRes.json().catch(() => ({}));
      return res.status(fulfillRes.status).json({
        error: `Shopify error ${fulfillRes.status}`,
        details: errorBody
      });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: traer pedidos pendientes
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
