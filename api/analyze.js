export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const { image, mediaType, imageUrl, mode, keywords, candidates } = req.body;

  try {
    let messages;

    if (mode === 'analyze') {
      let imageContent;

      if (imageUrl) {
        // URL에서 이미지 다운로드 시도
        try {
          const imgResp = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': imageUrl,
              'Accept': 'image/*'
            }
          });
          if (!imgResp.ok) throw new Error('이미지 다운로드 실패: ' + imgResp.status);
          const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim();
          const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
          if (!allowed.includes(mimeType)) throw new Error('지원하지 않는 이미지 형식');
          const buf = await imgResp.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          imageContent = { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } };
        } catch(e) {
          return res.status(422).json({ error: 'url_failed', message: e.message });
        }
      } else if (image) {
        imageContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } };
      } else {
        return res.status(400).json({ error: '이미지 또는 URL이 필요합니다' });
      }

      messages = [{
        role: 'user',
        content: [
          imageContent,
          { type: 'text', text: `이 상품 이미지를 보고 네이버 쇼핑에서 소비자가 실제로 검색할 핵심 키워드를 추출해줘.
상품의 용도, 기능, 특징, 소재 등을 파악해서 최대 5개 뽑아줘.
브랜드명이나 상표명은 절대 포함하지 마.
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

아래 조건으로 필터링해서 월간검색량 높은 순으로 최대 20개만 골라줘:
1. 위 상품과 직접 관련 있는 키워드만 포함
2. 브랜드명, 상표명, 기업명, 고유명사 제외 (예: 삼성, LG, 나이키, 애플, 다이슨 등)
3. 지식재산권/상표권 침해 우려 키워드 제외
4. 욕설, 비속어, 성인 관련 키워드 제외
5. 상품과 무관한 키워드 제외

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
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages })
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
