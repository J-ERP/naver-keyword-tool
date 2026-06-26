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
예를 들어 수세미가 캠핑, 욕실청소, 주방에서도 쓰일 수 있는 것처럼.

확장 가능한 용도가 있다면, 각 용도별로 "상품명+용도" 형태의 네이버 검색 키워드를 뽑아줘.
예: 상품이 수세미이고 용도가 캠핑이면 → "캠핑수세미", "캠핑설거지", "캠핑주방용품" 처럼.
확장 용도가 없거나 억지스러우면 빈 배열로 반환해.
브랜드명은 절대 포함하지 마.

JSON 형식으로만 응답해:
{"expanded": [{"usage": "캠핑", "keywords": ["캠핑수세미","캠핑설거지"]}, {"usage": "욕실", "keywords": ["욕실수세미","욕실청소수세미"]}]}
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

이 상품의 확장 용도와 직접 관련 있는 키워드를 브랜드명, 상표권, 욕설, 유아/어린이/키즈 제외하고 모두 골라줘.
JSON 형식으로만 응답해. 키워드와 검색량을 함께 반환해.
예: {"items":[{"keyword":"키워드1","vol":5000},{"keyword":"키워드2","vol":3000}]}
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

    // 블랙리스트 후처리 - Claude가 놓친 키워드 강제 제거
    const BLACKLIST_PATTERNS = [
      '의료용','의료기기','의료튜브','주사기','카테터','마이크로피펫','채수병','무균',
      '건강기능','의약외품','식약처','약품','약재',
      'KC인증','KS인증','CE인증','안전인증',
      '집진기','집진','PTFE','PFA튜브','타이곤',
      '주름관','실험용','연구용'
    ];

    const isBlacklisted = (kw) => BLACKLIST_PATTERNS.some(p => kw.includes(p));

    // keywords 형식을 items 형식으로 통일
    if (parsed.keywords && Array.isArray(parsed.keywords) && !parsed.items) {
      parsed.items = parsed.keywords
        .filter(kw => !isBlacklisted(kw))
        .slice(0, 20)
        .map(kw => ({ keyword: kw, vol: 0 }));
      delete parsed.keywords;
    }

    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items
        .filter(item => !isBlacklisted(item.keyword))
        .slice(0, 20);
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
