export default async function handler(req, res) {
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send('Faltan parámetros');
  }

  const CLIENT_ID = 'd08eb31e26b3b21e1e6337455ca4a6ce';
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const data = await tokenRes.json();

    if (data.access_token) {
      // Mostrar el token en pantalla para copiarlo
      return res.status(200).send(`
        <html><body style="font-family:monospace;padding:40px;background:#111;color:#e8ff47">
          <h2>✓ Token obtenido</h2>
          <p>Copiá este token y pegalo en Vercel como <strong>SHOPIFY_ADMIN_TOKEN</strong>:</p>
          <textarea rows="3" style="width:100%;padding:12px;font-size:14px;background:#222;color:#fff;border:1px solid #444;border-radius:8px" onclick="this.select()">${data.access_token}</textarea>
          <p style="color:#888;margin-top:16px">Una vez copiado, podés cerrar esta página.</p>
        </body></html>
      `);
    } else {
      return res.status(400).send(`Error: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`);
  }
}
