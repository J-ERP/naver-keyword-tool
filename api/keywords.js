import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const CUSTOMER_ID = process.env.NAVER_CUSTOMER_ID;
  const ACCESS_LICENSE = process.env.NAVER_ACCESS_LICENSE;
  const SECRET_KEY = process.env.NAVER_SECRET_KEY;

  const { keywords } = req.query;
  if (!keywords) return res.status(400).json({ error: 'keywords required' });

  const kwList = keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5);
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/keywordstool';
  const message = `${timestamp}.GET.${path}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(message).digest('base64');
  const params = new URLSearchParams({ showDetail: '1' });
  kwList.forEach(k => params.append('hintKeywords', k));

  try {
    const response = await fetch(`https://api.naver.com${path}?${params.toString()}`, {
      headers: {
        'X-Timestamp': String(timestamp),
        'X-API-KEY': ACCESS_LICENSE,
        'X-Customer': String(CUSTOMER_ID),
        'X-Signature': signature,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
