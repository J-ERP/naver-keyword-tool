export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const { image, mediaType, imageUrl, mode, keywords, candidates, mainKeywords } = req.body;

  try {
    let messages;

    if (mode === 'analyze') {
      let imageContent;
      if (imageUrl) {
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

    } else if (mode === 'expand') {
      // 6단계: 다용도 확장 분석
      let imageContent;
      if (imageUrl) {
        try {
          const imgResp = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': imageUrl,
              'Accept': 'image/*'
            }
          });
          const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim();
          const buf = await imgResp.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          imageContent = { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } };
        } catch(e) {
          return res.status(422).json({ error: 'url_failed', message: e.message });
        }
      } else if (image) {
        imageContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } };
      }

      const contentArr = [];
      if (imageContent) contentArr.push(imageContent);
      contentArr.push({ type: 'text', text: `이 상품의 주 용도는 "${mainKeywords.join(', ')}" 이야.
이 상품이 주 용도 외에 다른 장소나 상황에서도 활용될 수 있는지 분석해줘.
예를 들어 욕실용품이 수영장, 캠핑, 헬스장에서도 쓰일 수 있는 것처럼.

확장 가능한 용도가 있다면 각 용도별 네이버 검색 키워드를 뽑아줘.
확장 용도가 없거나 억지스러우면 빈 배열로 반환해.
브랜드명은 절대 포함하지 마.

JSON 형식으로만 응답해:
{"expanded": [{"usage": "수영장", "keywords": ["수영장가방걸이","수영장용품"]}, {"usage": "캠핑", "keywords": ["캠핑용품걸이"]}]}
다른 설명 없이 JSON만 출력해.` });

      messages = [{ role: 'user', content: contentArr }];

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
5. 유아, 어린이, 아동, 키즈, 베이비, 영유아 관련 키워드 제외
6. 상품과 무관한 키워드 제외

JSON 형식으로만 응답해. 예: {"keywords":["키워드1","키워드2"]}
다른 설명 없이 JSON만 출력해.`
      }];

    } else if (mode === 'filter_expand') {
      // 확장 키워드 필터링
      messages = [{
        role: 'user',
        content: `다음은 확장 용도 "${keywords.join(', ')}" 로 네이버 API에서 가져온 키워드야.
후보 키워드 목록 (키워드,월간검색량 형식):
${candidates.map(c => `${c.keyword},${c.vol}`).join('\n')}

이 상품의 확장 용도와 직접 관련 있고 검색량 높은 순으로 최대 5개만 골라줘.
브랜드명, 상표권 침해, 욕설, 유아/어린이/키즈 관련 키워드 제외.
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
