# 맥미니 점검 체크리스트 (2026-07-17)

> 노트북에서 작업한 내용이 GitHub에 올라가 있음.
> 맥미니에서 아래 순서대로 진행하면 됨.

---

## 0. 러너(자동 배포) 살리기 — 제일 먼저

현재 GitHub Actions 배포 2건이 러너를 기다리며 대기 중.
맥미니가 깨어나면 자동으로 순서대로 배포됨.

- [ ] 잠자기 끄기: `sudo pmset -a sleep 0` (또는 시스템 설정 → 에너지 절약)
- [ ] 러너를 서비스로 등록 (재부팅해도 자동 시작):
  ```sh
  cd <러너 설치 폴더>   # 보통 actions-runner
  ./svc.sh install
  ./svc.sh start
  ```
- [ ] GitHub 저장소 → Actions 탭에서 대기 중이던 Deploy 2건이 성공했는지 확인

## 1. Supabase 마이그레이션 (링크 묶음 기능용)

- [ ] Supabase Studio → SQL Editor에서 아래 실행
  (`supabase/migrations/20260717000000_bundle_items.sql` 내용과 동일):
  ```sql
  alter table public.short_links
  add column if not exists bundle_items jsonb;
  ```
- 적용 전에도 다른 기능은 정상, "링크 묶음 만들기"만 에러 남

## 2. 새 기능 동작 테스트 (실제 사이트에서)

- [ ] **한글 주소**: "원하는 주소 이름"에 `점검테스트` 입력해 생성 → 접속되는지
- [ ] **같은 이름 재생성** → "이미 사용 중" 에러가 나오는지 (중복 거부 확인)
- [ ] **QR 자체 생성**: 만든 링크의 QR이 잘 뜨는지 (이제 외부 서비스 안 씀)
- [ ] **발표 모드**: QR 모달 → 🎬 발표 모드 → 전체화면에 QR·주소·접속 인원 표시
- [ ] **실시간 입장 인원**: 발표 모드 켜둔 채 휴대폰으로 QR 스캔 →
      10초 내에 "최근 5분 접속"이 1 올라가는지
- [ ] **링크 묶음**: 만들기 유형 → 링크 묶음 → 제목 + 링크 2개 입력해 생성 →
      짧은 주소 접속 시 버튼 목록 페이지가 나오는지
- [ ] **만료 연장**: 내 링크에서 카드 열고 "⏰ 만료 1개월 연장" 동작 확인

## 3. Cloudflare Tunnel 설정 (보안 — 시간 될 때)

- [ ] `docs/cloudflare-tunnel-setup.md` 가이드 따라 진행
- [ ] `.env.local`에 `TUNNEL_TOKEN=...` 추가
- [ ] `.env.local`에서 `TRUST_PROXY_HEADERS=true`로 변경
- [ ] `docker compose --env-file .env.local up -d --build`
- [ ] 정상 확인 후 공유기 포트포워딩(3002) 삭제

## 문제 생기면

- 배포 실패: GitHub → Actions → 실패한 Deploy 클릭 → 로그 복사해서 Claude에게
- 사이트 이상: `docker compose logs app --tail 100` 로그 확인
- 롤백: `git revert 189eaf7` 후 푸시하면 기능 추가 전으로 복귀
