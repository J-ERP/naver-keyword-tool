export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;
  const users = (process.env.LOGIN_USERS || '').split(',').map(u => {
    const [id, pw] = u.split(':');
    return { id: id?.trim(), pw: pw?.trim() };
  });

  const match = users.find(u => u.id === username && u.pw === password);
  if (!match) return res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });

  // 간단한 토큰: base64(username:timestamp)
  const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
  return res.status(200).json({ token, username });
}
