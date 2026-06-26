# 소싱 키워드 관리 도구

## Vercel 배포 방법

### 1. GitHub 업로드
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/naver-keyword-tool.git
git push -u origin main
```

### 2. Vercel 배포
1. vercel.com → Add New Project → 저장소 선택
2. Environment Variables 추가:

| 변수명 | 값 |
|--------|-----|
| `NAVER_CUSTOMER_ID` | b41206 |
| `NAVER_ACCESS_LICENSE` | 01000000001be9b374eca7ee0fe85c5665b147560e8a9ed542e21d2dbca305a34f87dad67a |
| `NAVER_SECRET_KEY` | AQAAAAAb6bN07KfuD+hcVmWxR1YOjdF27cL0BoYwCBXOydF/kA== |

3. Deploy 클릭

## 기능
- 네이버 키워드 광고 API 조회 (단일/다용도)
- 다용도 상품 용도별 키워드 자동 배분 (20개 이내)
- 상품 등록/수정/삭제 (순번, 상품명, 태그키워드, 사용여부)
- 상품명/태그 키워드 검색 → 이전 이력 재사용
- CSV 내보내기
