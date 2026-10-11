import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { connectStateMatches, createConnectState, isConnectState } from '../lib/connect-state-core.ts';

// 2026-10-11 보안 점검: 샘링크.kr 직접 연결(계정 연결 CSRF)은 연결을 누른 브라우저의 일회용 state 가 있어야 한다.
test('state 는 48자 16진수 난수이고 같은 값끼리만 맞는다', () => {
  const a = createConnectState();
  const b = createConnectState();
  assert.ok(isConnectState(a));
  assert.notEqual(a, b);
  assert.equal(connectStateMatches(a, a), true);
  assert.equal(connectStateMatches(a, b), false);
});

test('state 가 없거나 형식이 틀리거나 쿠키가 없으면 거절', () => {
  const a = createConnectState();
  assert.equal(connectStateMatches('', a), false);
  assert.equal(connectStateMatches(undefined, a), false);
  assert.equal(connectStateMatches(a, ''), false, '쿠키가 없는 브라우저(남이 만든 주소를 연 피해자)');
  assert.equal(connectStateMatches(a, undefined), false);
  assert.equal(connectStateMatches('x'.repeat(48), 'x'.repeat(48)), false, '16진수가 아니면 같아도 거절');
  assert.equal(connectStateMatches(123, 123), false);
});

test('직접 연결 API 는 state 를 확인한 뒤에만 연결하고 실패해도 쿠키를 버린다, 아지트 안 연결은 별도 길이다', async () => {
  const [connect, embed, start, bar, page] = await Promise.all([
    readFile('app/api/account/connect/route.ts', 'utf8'),
    readFile('app/api/account/connect-embed/route.ts', 'utf8'),
    readFile('app/api/account/connect-start/route.ts', 'utf8'),
    readFile('app/account-bar.tsx', 'utf8'),
    readFile('app/connect/page.tsx', 'utf8'),
  ]);
  assert.match(connect, /connectStateMatches\(body\.state, readConnectStateCookie\(request\)\)/);
  assert.match(connect, /status: 403/);
  assert.match(connect, /clearConnectStateCookie/);
  assert.doesNotMatch(embed, /connectState|connect-state/, 'embed 길은 state 를 쓰지 않는다');
  assert.match(start, /setConnectStateCookie/);
  assert.match(bar, /connect-start/);
  assert.match(bar, /state \? "\/api\/account\/connect" : "\/api\/account\/connect-embed"/);
  assert.match(page, /params\.get\("state"\)/);
  assert.match(page, /connectWithTicket\(ticket, state\)/);
});
