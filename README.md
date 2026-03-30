# Private Short Links

지인끼리 쓸 수 있는 가벼운 URL 단축 서비스입니다.  
배포는 Vercel, 데이터 저장은 Supabase Postgres 기준으로 구성했습니다.

## 구조

- `Next.js` 앱을 Vercel에 배포
- `Supabase`의 `short_links` 테이블에 링크 저장
- `POST /api/shorten` 에서 새 단축 링크 생성
- `GET /[slug]` 에서 원본 URL로 리다이렉트
- 링크 생성은 `SHORTENER_ADMIN_TOKEN` 으로 보호

## 로컬 실행

1. 의존성 설치

```bash
npm install
```

2. 환경변수 준비

`.env.example` 을 `.env.local` 로 복사한 뒤 값을 채웁니다.

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SHORTENER_ADMIN_TOKEN=...
```

3. Supabase SQL 실행

`supabase/schema.sql` 내용을 SQL Editor에서 실행합니다.

4. 개발 서버 시작

```bash
npm run dev
```

## Vercel 배포 시 설정할 환경변수

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHORTENER_ADMIN_TOKEN`

`NEXT_PUBLIC_SITE_URL` 은 배포 도메인으로 맞추는 것이 안전합니다. 예: `https://go.yourdomain.com`

## 다음 확장 추천

- 클릭 로그를 별도 테이블로 분리해서 최근 유입 보기
- 링크별 만료일과 비활성화 스위치 추가
- 지인별 접근 권한이 필요하면 Supabase Auth 도입
- 관리자 화면에서 링크 목록/삭제/수정 기능 추가
