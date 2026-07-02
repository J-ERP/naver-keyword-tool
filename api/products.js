const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isMaster = req.query.master === '1';

  try {

    // ── products_master 검색 (GET ?master=1&q=검색어) ──────────────
    if (isMaster && req.method === 'GET') {
      const q = req.query.q || '';
      if (!q) return res.status(200).json([]);
      const encoded = encodeURIComponent(`%${q}%`);
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/products_master?product_name=ilike.${encoded}&select=id,product_name,keywords,link,order_link,image_link&order=product_name.asc&limit=10`,
        { headers }
      );
      const data = await resp.json();
      return res.status(200).json(data);
    }

    // ── products_master 삭제 (DELETE ?master=1&id=xxx) ─────────────
    if (isMaster && req.method === 'DELETE') {
      const { id } = req.query;
      await fetch(`${SUPABASE_URL}/rest/v1/products_master?id=eq.${id}`, {
        method: 'DELETE',
        headers
      });
      return res.status(200).json({ success: true });
    }

    // ── 기존 products CRUD ─────────────────────────────────────────
    if (req.method === 'GET') {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.asc`, { headers });
      const data = await resp.json();
      return res.status(200).json(data);

    } else if (req.method === 'POST') {
      const { id, name, tags, active, created_at } = req.body;
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ id, name, tags, active, created_at })
      });
      const data = await resp.json();
      return res.status(200).json(data);

    } else if (req.method === 'PUT') {
      const { id, name, tags, active } = req.body;
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ name, tags, active })
      });
      const data = await resp.json();
      return res.status(200).json(data);

    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
        method: 'DELETE',
        headers
      });
      return res.status(200).json({ success: true });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
