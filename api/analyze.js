export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const { image, mediaType, mode, keywords, candidates } = req.body;

  try {
    let messages;

    if (mode === 'analyze') {
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `이 상품 이미지를 보고 네이버 쇼핑에서 검색할 핵심 키워드를 추출해줘.
상품의 용도, 기능, 특징을 파악해서 실제 소비자가 검색할 키워드를 최대 5개 뽑아줘.
JSON 형식으로만 응답해. 예: {"keywords":["충전기보관함","케이블정리함","멀티탭수납"]}
다른 설명 없이 JSON만 출력해.` }
        ]
      }];
    } else if (mode === 'filter') {
      messages = [{
        role: 'user',
        content: `다음은 네이버 키워드 광고 API에서 가져온 키워드 목록이야.
검색 기준 키워드: ${keywords.join(', ')}
후보 키워드 목록 (키워드,월간검색량 형식):
${candidates.map(c => `${c.keyword},${c.vol}`).join('\n')}

위 상품과 직접 관련 있는 키워드만 골라서 월간검색량 높은 순으로 최대 20개 추려줘.
상품과 무관한 키워드는 제외해.
JSON 형식으로만 응답해. 예: {"keywords":["키워드1","키워드2"]}
다른 설명 없이 JSON만 출력해.`
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
