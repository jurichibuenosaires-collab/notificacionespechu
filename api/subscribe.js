// Guarda suscripciones push en memoria (Vercel KV sería mejor pero esto funciona)
// Para producción real usar Vercel KV o una DB

const subs = global.pushSubscriptions = global.pushSubscriptions || [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const sub = req.body;
    // Evitar duplicados por endpoint
    const exists = subs.find(s => s.endpoint === sub.endpoint);
    if (!exists) subs.push(sub);
    return res.status(200).json({ ok: true, total: subs.length });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ total: subs.length });
  }

  return res.status(405).end();
}
