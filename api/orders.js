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

    if (action !== 'fulfill') {
      return res.status(200).json({ ok: true });
    }

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
        // Ya estaba fulfillado o no hay nada pendiente
        return res.status(200).json({ ok: true, message: 'No hay items pendientes de fulfillment' });
      }

      // 2. Crear el fulfillment con la API nueva (sin location_id — ya está en el FO)
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
              message: 'Listo para entregar',
              notify_customer: false,
              line_items_by_fulfillment_order: openFOs.map(fo => ({
                fulfillment_order_id: fo.id
              }))
            }
          })
        }
      );

      if (fulfillRes.ok) {
        return res.status(200).json({ ok: true });
      }

      const fulfillError = await fulfillRes.json().catch(() => ({}));

      // Si el error es de permisos (403) o el endpoint no acepta este formato (422),
      // intentar con el metodo legacy
      if (fulfillRes.status === 403 || fulfillRes.status === 422) {
        return await legacyFulfill(SHOP, TOKEN, orderId, res);
      }

      return res.status(fulfillRes.status).json({
        error: `Error al completar el pedido (${fulfillRes.status})`,
        details: fulfillError
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

async function legacyFulfill(SHOP, TOKEN, orderId, res) {
  try {
    // Obtener la primera ubicacion activa
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
      return res.status(500).json({ error: 'No se encontro ninguna ubicacion activa' });
    }

    // Obtener la orden para los line items
    const orderRes = await fetch(
      `https://${SHOP}/admin/api/2024-01/orders/${orderId}.json`,
      { headers: { 'X-Shopify-Access-Token': TOKEN } }
    );

    if (!orderRes.ok) {
      const txt = await orderRes.text();
      return res.status(orderRes.status).json({ error: `Error obteniendo orden: ${txt}` });
    }

    const orderData = await orderRes.json();
    const order = orderData.order;

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const lineItems = (order.line_items || [])
      .map(li => ({ id: li.id, quantity: li.fulfillable_quantity || li.quantity }))
      .filter(li => li.quantity > 0);

    const fulfillRes = await fetch(
      `https://${SHOP}/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfillment: {
            location_id: location.id,
            notify_customer: false,
            line_items: lineItems
          }
        })
      }
    );

    if (!fulfillRes.ok) {
      const errorBody = await fulfillRes.json().catch(() => ({}));
      return res.status(fulfillRes.status).json({
        error: `Error al completar el pedido (${fulfillRes.status})`,
        details: errorBody
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
