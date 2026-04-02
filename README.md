# 쌤링크

작은 그룹용 URL 단축기입니다. Vercel에서 호스팅하고, Supabase Postgres와 Supabase Auth로 관리합니다.

## 주요 기능

- 원본 주소를 짧은 링크로 변환
- 4자리 코드 자동 생성
- 유지 기간 선택: `1일`, `1주일`, `1달`
- 만료된 링크는 DB에서 자동 정리
- `/admin` 에서 생성 이력 조회, 비활성화, 삭제

## 실행 준비

1. 의존성 설치

```bash
npm install
```

2. 환경변수 설정

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```env
NEXT_PUBLIC_SITE_URL=https://샘링크.kr
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=admin@example.com
SHORTENER_ADMIN_TOKEN=...
```

3. Supabase 스키마 실행

Supabase SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql)을 실행합니다.

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
- `NEXT_PUBLIC_SITE_URL`은 실제 도메인으로 맞춥니다.
- `ADMIN_EMAIL`은 관리자 계정 이메일과 같아야 합니다.

