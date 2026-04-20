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
      // Incluir 'open' e 'in_progress' — ambos son estados fulfillables
      const openFOs = (foData.fulfillment_orders || []).filter(
        fo => fo.status === 'open' || fo.status === 'in_progress'
      );

      if (openFOs.length === 0) {
        return res.status(200).json({ ok: true, message: 'No hay items pendientes' });
      }

      // 2. Crear el fulfillment con la estructura correcta para API 2024-01
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
                fulfillment_order_line_items: (fo.line_items || [])
                  .filter(li => li.fulfillable_quantity > 0)
                  .map(li => ({
                    id: li.id,
                    quantity: li.fulfillable_quantity
                  }))
              }))
            }
          })
        }
      );

      const fulfillBody = await fulfillRes.json().catch(() => ({}));

      if (fulfillRes.ok) {
        // Verificar que el fulfillment quedó en estado 'success'
        const status = fulfillBody?.fulfillment?.status;
        if (status && status !== 'success') {
          return res.status(200).json({
            ok: false,
            error: `Fulfillment creado pero con estado: ${status}`,
            details: fulfillBody
          });
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(fulfillRes.status).json({
        error: `Shopify error ${fulfillRes.status}`,
        details: fulfillBody
      });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET: traer pedidos pendientes
  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2024-01/orders.json?status=open&fulfillment_status=unfulfilled&financial_status=paid&limit=50`,
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
