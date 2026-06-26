import crypto from 'crypto';

const BLACKLIST = [
  '의료용','의료기기','의료튜브','주사기','카테터','마이크로피펫','채수병','무균',
  '건강기능','의약외품','식약처','약품','약재','타이곤','실험용','연구용',
  'KC인증','KS인증','CE인증','안전인증','집진기','집진','PTFE','PFA튜브','주름관'
];

const isOk = (kw) => !BLACKLIST.some(p => kw.includes(p));

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function fetchImage(imageUrl) {
  const res = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': imageUrl,
      'Accept': 'image/*'
    }
  });
  if (!res.ok) throw new Error('이미지 다운로드 실패: ' + res.status);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  if (!['image/jpeg','image/png','image/gif','image/webp'].includes(mimeType))
    throw new Error('지원하지 않는 이미지 형식');
  const buf = await res.arrayBuffer();
  return { b64: Buffer.from(buf).toString('base64'), mimeType };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  const { mode, image, mediaType, imageUrl, userKeywords,
          userCandidates, claudeCandidates, keywords, candidates } = req.body;

  try {

    if (mode === 'analyze') {
      let imageContent;
      if (imageUrl) {
        try {
          const { b64, mimeType } = await fetchImage(imageUrl);
          imageContent = { type:'image', source:{ type:'base64', media_type:mimeType, data:b64 } };
        } catch(e) {
          return res.status(422).json({ error:'url_failed', message:e.message });
        }
      } else {
        imageContent = { type:'image', source:{ type:'base64', media_type:mediaType, data:image } };
      }

      const result = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: [
            imageContent,
            { type:'text', text:'이 상품 이미지를 보고 네이버 쇼핑에서 소비자가 실제로 검색할 핵심 키워드를 최대 5개 추출해줘.\n브랜드명 제외. JSON만 반환.\n예: {"keywords":["실리콘튜브","투명호스"]}' }
          ]}]
        })
      });
      const data = await result.json();
      const text = data.content?.[0]?.text || '{}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    if (mode === 'filter') {
      const hasUser = (userKeywords||[]).length > 0;
      const uCands = (userCandidates||[]).filter(c => isOk(c.keyword));
      const cCands = (claudeCandidates||[]).filter(c => isOk(c.keyword));

      const prompt = hasUser
        ? `너는 네이버 쇼핑 키워드 전문가야. 소량다품종 판매자를 위한 태그 키워드를 선정해줘.

[사용자 힌트 키워드 - 이 상품의 실제 소싱 의도]
${userKeywords.join(', ')}

[힌트 키워드 기반 네이버 조회 결과] (키워드,검색량,경쟁도)
${uCands.map(c=>`${c.keyword},${c.vol},${c.compIdx}`).join('\n')}

[AI 분석 키워드 기반 네이버 조회 결과] (키워드,검색량,경쟁도)
${cCands.map(c=>`${c.keyword},${c.vol},${c.compIdx}`).join('\n')}

선정 규칙:
1. 제외: 정보성(사용법/후기/비교/~이란/~뜻), 브랜드명, 욕설, 유아/키즈, 의료기기, 식약처인증, KS/KC인증
2. [힌트 기반 조회 결과]에서 힌트 키워드와 직접 연관된 키워드 먼저 선정
3. 힌트 키워드 자체는 반드시 포함
4. 나머지 빈자리는 [AI 분석 조회 결과]에서 채우기
5. 경쟁도 LOW → MID → HIGH 순 우선
6. 같은 경쟁도면 검색량 높은 순
7. 상품과 무관한 키워드 제외
8. 최대 20개, 관련 키워드 부족하면 모자라도 됨

JSON만: {"keywords":["키워드1","키워드2"],"productName":"추천상품명"}`
        : `너는 네이버 쇼핑 키워드 전문가야. 소량다품종 판매자를 위한 태그 키워드를 선정해줘.

[AI 분석 키워드 기반 네이버 조회 결과] (키워드,검색량,경쟁도)
${cCands.map(c=>`${c.keyword},${c.vol},${c.compIdx}`).join('\n')}

선정 규칙:
1. 제외: 정보성(사용법/후기/비교/~이란/~뜻), 브랜드명, 욕설, 유아/키즈, 의료기기, 식약처인증, KS/KC인증
2. 경쟁도 LOW → MID → HIGH 순 우선
3. 같은 경쟁도면 검색량 높은 순
4. 상품과 무관한 키워드 제외
5. 최대 20개, 관련 키워드 부족하면 모자라도 됨

JSON만: {"keywords":["키워드1","키워드2"],"productName":"추천상품명"}`;

      const parsed = await callClaude(KEY, prompt);
      const final = (parsed.keywords||[]).filter(isOk).slice(0, 20);
      return res.status(200).json({ keywords: final, productName: parsed.productName||'' });
    }

    if (mode === 'expand') {
      const hasUser = (userKeywords||[]).length > 0;
      let imageContent = null;
      if (imageUrl) {
        try { const { b64, mimeType } = await fetchImage(imageUrl); imageContent = { type:'image', source:{ type:'base64', media_type:mimeType, data:b64 } }; } catch(e) {}
      } else if (image) {
        imageContent = { type:'image', source:{ type:'base64', media_type:mediaType, data:image } };
      }

      const expandPrompt = hasUser
        ? `이 상품의 힌트 키워드는 "${userKeywords.join(', ')}" 이야. 힌트 키워드 중심으로 다른 장소/상황 확장 분석해줘. 각 용도별로 "힌트키워드+용도" 형태 키워드 뽑아줘. 억지 확장 금지. 브랜드명 제외.\nJSON만: {"expanded":[{"usage":"핸드메이드","keywords":["핸드메이드가방손잡이"]}]}`
        : `이 상품이 주 용도 외 다른 장소/상황에서도 활용 가능한지 분석해줘. 각 용도별로 "상품명+용도" 형태 키워드 뽑아줘. 억지 확장 금지. 브랜드명 제외.\nJSON만: {"expanded":[{"usage":"캠핑","keywords":["캠핑수세미"]}]}`;

      const contentArr = [];
      if (imageContent) contentArr.push(imageContent);
      contentArr.push({ type:'text', text:expandPrompt });

      const result = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role:'user', content:contentArr }] })
      });
      const data = await result.json();
      const text = data.content?.[0]?.text || '{}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    if (mode === 'filter_expand') {
      const cands = (candidates||[]).filter(c => isOk(c.keyword));
      const prompt = `확장 용도 "${(keywords||[]).join(', ')}" 와 직접 관련 있고 구매 의도 있는 키워드만. 후보: ${cands.map(c=>`${c.keyword},${c.vol}`).join('\n')} 최대 5개. 브랜드/유아/의료/인증 제외.\nJSON만: {"keywords":["키워드1"]}`;
      const parsed = await callClaude(KEY, prompt);
      return res.status(200).json({ keywords: (parsed.keywords||[]).filter(isOk).slice(0,5) });
    }

    return res.status(400).json({ error: 'unknown mode' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}