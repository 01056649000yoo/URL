import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-10-14 보안 점검에서 고친 것들이 되돌아오지 않게 지키는 검사(원본 코드 모양으로 확인).

test('계정 연결: state 가 없으면 서버로 보내지 않고, 아지트 안 연결은 별도 함수로만 부른다', async () => {
  const bar = await readFile('app/account-bar.tsx', 'utf8');
  const page = await readFile('app/connect/page.tsx', 'utf8');
  assert.match(bar, /if \(!state\) throw new Error/);
  assert.match(bar, /export async function connectEmbedded/);
  assert.doesNotMatch(page, /connectEmbedded|connect-embed/);
});

test('단축 만들기: 주소·본문 길이 상한이 있고 DB 오류 문구를 응답에 싣지 않는다', async () => {
  const src = await readFile('app/api/shorten/route.ts', 'utf8');
  assert.match(src, /MAX_URL_LENGTH = 2048/);
  assert.match(src, /MAX_BODY_BYTES/);
  assert.match(src, /destination\.length > MAX_URL_LENGTH/);
  assert.match(src, /rawUrl\.length > MAX_URL_LENGTH/);
  assert.doesNotMatch(src, /\$\{rateLimitError\.message\}/);
  assert.doesNotMatch(src, /\$\{error\.message\}/);
  assert.doesNotMatch(src, /error instanceof Error \? error\.message/);
});

test('QR: 운영에서는 요청 머리글의 호스트를 믿지 않는다', async () => {
  const src = await readFile('app/api/qr/route.ts', 'utf8');
  assert.doesNotMatch(src, /headers\.get\("x-forwarded-host"\)/);
  assert.match(src, /NODE_ENV === "production" \? null/);
});

test('방문 기록: Referer 는 출처(origin)만 남긴다', async () => {
  const src = await readFile('lib/visitor.ts', 'utf8');
  assert.match(src, /parsed\.origin/);
  assert.doesNotMatch(src, /headers\.get\("referer"\)\?\.trim\(\) \|\| null/);
});

test('묶음 화면: http·https 가 아닌 주소는 열지 않는다', async () => {
  const src = await readFile('app/b/[slug]/page.tsx', 'utf8');
  assert.match(src, /safeHref/);
  assert.match(src, /href=\{safeHref\}/);
  assert.doesNotMatch(src, /href=\{item\.url\}/);
});
