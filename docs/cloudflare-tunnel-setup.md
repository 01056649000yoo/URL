# Cloudflare Tunnel 설정 가이드 (맥미니에서 작업)

> ✅ **2026-07-18 적용 완료**: 샘링크.kr은 이 가이드의 전용 터널 대신,
> 같은 Mac에서 이미 돌고 있던 **jarvis-tunnel**(+jarvis-caddy)을 통해 서비스되고 있음이 확인됨.
> DNS(CNAME → 4f39e38f….cfargotunnel.com)와 Caddy 라우팅(→ host.docker.internal:3002)이 이미 구성돼 있고,
> `.env.local`에 `TRUST_PROXY_HEADERS=true`도 적용됨. **남은 일은 6단계(공유기 포트포워딩 3002 삭제)뿐.**
> 아래 내용은 전용 터널을 새로 만들 때를 위한 참고용으로 남겨둔다.

> 목적: 맥미니 서버의 "뒷문"(공유기 포트포워딩)을 없애고,
> 모든 접속이 반드시 Cloudflare(경비원)를 거치게 만든다.
> 소요 시간: 약 20~30분. 작업 중에도 사이트는 계속 동작한다.

---

## 준비물

- [ ] Cloudflare 계정 로그인 정보
- [ ] 맥미니에서 이 저장소 최신화: `git pull`
- [ ] 터미널에서 프로젝트 폴더로 이동

---

## 1단계. Cloudflare에서 터널 만들기 (브라우저)

1. https://dash.cloudflare.com 로그인
2. 왼쪽 메뉴 하단 **Zero Trust** 클릭
   - 처음이면 플랜 선택 화면이 나옴 → **Free** 선택 (무료, 카드 등록 불필요)
3. **Networks → Tunnels → Create a tunnel** 클릭
4. **Cloudflared** 선택 → Next
5. 터널 이름: `samlink` 입력 → Save tunnel
6. "Install and run a connector" 화면에서 **Docker** 탭 클릭
7. 표시된 명령어 안의 `--token eyJ...` 뒤에 오는 **긴 토큰 문자열만 복사**
   - 이 화면을 닫지 말고 2단계 진행 (닫았어도 Tunnels 목록에서 다시 볼 수 있음)

---

## 2단계. 토큰을 .env.local에 추가 (맥미니 터미널)

프로젝트 폴더의 `.env.local` 파일을 열고 맨 아래에 한 줄 추가:

```
TUNNEL_TOKEN=여기에_복사한_토큰_붙여넣기
```

같은 파일에서 아래 값도 `true`로 변경 (레이트리밋이 IP별로 제대로 동작하게 됨):

```
TRUST_PROXY_HEADERS=true
```

---

## 3단계. 컨테이너 재시작

`docker-compose.yml`에는 터널 서비스(`tunnel:`)가 **이미 추가되어 있음** — 파일 수정 불필요.
`git pull`로 최신 코드를 받았다면 바로 재시작만 하면 된다:

```sh
docker compose --env-file .env.local up -d --build
```

터널 연결 확인:

```sh
docker compose logs tunnel
```

`Registered tunnel connection` 이라는 로그가 보이면 연결 성공.

---

## 4단계. Cloudflare에서 도메인 연결 (브라우저)

1. Zero Trust → **Networks → Tunnels** → `samlink` 터널 클릭 → **Edit**
2. **Public Hostname** 탭 → **Add a public hostname**
3. 입력값:
   - **Subdomain**: 비워둠
   - **Domain**: `샘링크.kr` (xn--9y2br3k43n.kr) 선택
   - **Type**: `HTTP`
   - **URL**: `app:3000`
4. Save

> ⚠️ "An A, AAAA, or CNAME record with that host already exists" 오류가 나면:
> Cloudflare 대시보드(일반 대시보드) → 해당 도메인 → **DNS** 메뉴에서
> `샘링크.kr`(또는 `@`)에 걸려 있는 기존 **A 레코드를 삭제**한 뒤 다시 Save.
> (터널이 CNAME 레코드를 자동으로 만들어 대체함)

---

## 5단계. 동작 확인

- [ ] 브라우저(휴대폰 LTE로 하면 더 확실)에서 `https://샘링크.kr` 접속 → 정상적으로 뜨는지
- [ ] 단축 링크 하나 만들어보고 → 리다이렉트 되는지
- [ ] QR 코드 생성되는지

전부 정상이면 다음 단계로.

---

## 6단계. 뒷문 닫기 (공유기)

1. 공유기 관리 페이지 접속 (보통 http://192.168.0.1 또는 192.168.1.1)
2. **포트포워딩** 설정 메뉴에서 맥미니의 **3002 포트**(외부→내부) 규칙 **삭제**
3. 삭제 후 다시 `https://샘링크.kr` 접속해서 여전히 잘 되는지 확인
   - 터널은 포트를 열 필요가 없으므로 삭제해도 사이트는 정상 동작해야 함

---

## 7단계(선택). Cloudflare 보안 옵션 켜기 (브라우저, 전부 무료)

일반 대시보드 → 도메인 선택 후:

- [ ] **SSL/TLS → Overview**: 모드를 **Full (strict)** 로 — 터널을 쓰면 strict가 안전
- [ ] **SSL/TLS → Edge Certificates**: **Always Use HTTPS** 켜기, **HSTS** 켜기
- [ ] **Security → Bots**: **Bot Fight Mode** 켜기
- [ ] **Security → WAF → Rate limiting rules**: 규칙 1개 무료 —
  경로 `/api/admin/login` 에 "10초에 5회 초과 시 차단" 정도로 설정

---

## 문제 생겼을 때 (롤백)

터널이 안 되고 사이트가 죽었다면:

1. 공유기 포트포워딩(3002)을 다시 추가하면 기존 방식으로 즉시 복구됨
2. Cloudflare DNS에서 터널이 만든 CNAME을 지우고, 원래 A 레코드(맥미니 공인 IP)를 다시 추가
3. `docker compose logs tunnel` 로그를 복사해서 Claude에게 물어보기

---

## 완료 체크리스트

- [ ] 터널 연결됨 (`Registered tunnel connection` 로그)
- [ ] 샘링크.kr 정상 접속
- [ ] 공유기 포트포워딩 삭제됨
- [ ] `TRUST_PROXY_HEADERS=true` 적용됨
- [ ] (선택) HTTPS/HSTS/Bot Fight Mode/로그인 레이트리밋 설정
