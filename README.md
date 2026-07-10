# 샘링크

작은 그룹용 URL 단축기입니다. Next.js 앱이며, Supabase Postgres와 Supabase Auth를 사용합니다.

## 주요 기능

- 원본 주소를 짧은 링크로 변환
- 4자리 코드 자동 생성
- 유지 기간 선택: `1일`, `1주일`, `1개월`, `3달`
- 만료된 링크는 DB에서 자동 정리
- `/admin` 에서 생성 이력 조회, 비활성화, 삭제

## 실행 준비

1. 의존성 설치

```bash
npm install
```

2. 환경변수 설정

`.env.local.example` 또는 `.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```env
SITE_URL=https://샘링크.kr
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=admin@example.com
SHORTENER_ADMIN_TOKEN=...
TRUST_PROXY_HEADERS=false
```

3. Supabase 스키마 실행

Supabase SQL Editor 또는 `psql`로 [supabase/schema.sql](./supabase/schema.sql)을 실행합니다.
기존 운영 DB에는 [20260710120000_hardening_and_stats_triggers.sql](./supabase/migrations/20260710120000_hardening_and_stats_triggers.sql)도 순서대로 적용합니다.

4. 관리자 계정 생성

Supabase Dashboard의 `Auth` > `Users`에서 `ADMIN_EMAIL`과 같은 이메일을 가진 계정을 하나 만듭니다.

5. 개발 서버 실행

```bash
npm run dev
```

## 관리자 페이지

- 주소: `/admin`
- Supabase Auth 이메일/비밀번호로 로그인
- 링크 목록, 클릭 수, 만료일, 상태 확인
- 링크 비활성화, 복원, 삭제 가능

## 배포 메모

- Vercel `Environment Variables`에 위 환경변수를 넣습니다.
- `SITE_URL`은 실제 도메인으로 맞춥니다.
- `TRUST_PROXY_HEADERS`는 Cloudflare, Vercel 또는 신뢰할 수 있는 리버스 프록시가 원본 IP 헤더를 덮어쓸 때만 `true`로 설정합니다.
- `ADMIN_EMAIL`은 관리자 계정 이메일과 같아야 합니다.

## 맥미니 Docker + 로컬 Supabase 운영

1. 로컬 Supabase 실행

```bash
npx supabase start
```

2. 로컬 DB에 스키마 적용

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/schema.sql
```

3. 환경변수 파일 준비

```bash
cp .env.local.example .env.local
```

- `SUPABASE_URL=http://host.docker.internal:54321`
- `SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 `npx supabase start` 출력값을 사용합니다.
- `SITE_URL`은 실제 접속 도메인으로 바꿉니다.
- 리버스 프록시를 사용한다면 프록시가 클라이언트 IP 헤더를 직접 덮어쓰는지 확인한 뒤 `TRUST_PROXY_HEADERS=true`로 설정합니다.

4. 로컬 Supabase Studio에서 관리자 계정 생성

- `http://127.0.0.1:54323`
- `Auth > Users`
- `ADMIN_EMAIL`과 같은 이메일의 사용자를 하나 생성합니다.

5. Docker 실행

```bash
docker compose --env-file .env.local up -d --build
```

- `app` 서비스가 Next.js 앱을 실행합니다.
- `cleanup` 서비스가 1시간마다 `/api/cleanup-expired`를 호출해 만료 링크를 정리합니다.
- Docker 실행 시 `.env.local`의 서버 환경변수가 필요하므로 `--env-file .env.local` 옵션을 함께 사용합니다.

6. 로그 확인

```bash
docker compose --env-file .env.local logs -f app
docker compose --env-file .env.local logs -f cleanup
```

## 수동 배포

새 코드를 반영할 때는 서버에서 직접 아래 순서로 수동 배포합니다.

1. 최신 코드를 가져옵니다.

```bash
git pull
```

2. 컨테이너를 다시 빌드해 올립니다.

```bash
docker compose --env-file .env.local up -d --build
```

3. 필요하면 로그를 확인합니다.

```bash
docker compose --env-file .env.local logs -f app
docker compose --env-file .env.local logs -f cleanup
```

## 데이터 이전

원격 Supabase에서 로컬 Supabase로 옮길 때는 먼저 로컬 스키마를 적용한 뒤, `public` 데이터만 가져오는 방식이 가장 단순합니다.

```bash
pg_dump "REMOTE_DB_URL" \
  --data-only \
  --inserts \
  --table=public.short_links \
  --table=public.short_link_stats \
  --table=public.short_link_daily_stats \
  --table=public.short_link_notifications \
  --table=public.short_link_rate_limits \
  > data.sql
```

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres < data.sql
```

이 프로젝트는 관리자 로그인만 있으면 운영 가능하므로, 보통은 `auth.users` 전체 이전 대신 로컬 Supabase에서 관리자 계정만 새로 만드는 편이 안전합니다.
