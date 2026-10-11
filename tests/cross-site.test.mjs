import assert from 'node:assert/strict';
import test from 'node:test';
import { isCrossSiteRequest, siteHost } from '../lib/cross-site.ts';

// 샘링크 바꾸는 요청 문지기(2026-10-04 도입, 10-08·10-10 오탐 수정, 10-11 같은 사이트 다른 하위 주소 차단).
const HOSTS = new Set(['xn--9y2br3k43n.kr']);
const call = (method, headers = {}) => isCrossSiteRequest({ method, header: (name) => headers[name] ?? null, allowedHosts: HOSTS });

test('읽기 요청은 늘 통과', () => {
  assert.equal(call('GET', { 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(call('HEAD'), false);
});

test('샘링크 자기 화면(https·http·www, same-origin)에서 보낸 요청은 통과 — 10-08·10-10 오탐 방지', () => {
  assert.equal(call('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://xn--9y2br3k43n.kr' }), false);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://www.xn--9y2br3k43n.kr' }), false);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-origin', origin: 'http://xn--9y2br3k43n.kr' }), false);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-origin', origin: 'null' }), false, '개인정보 보호 설정으로 Origin 이 null 이어도 same-origin 이면 통과');
});

test('같은 사이트의 다른 하위 주소(app.·evil.)에서 온 요청은 막는다 — 2026-10-11 재현', () => {
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site', origin: 'https://app.xn--9y2br3k43n.kr' }), true);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site', origin: 'https://evil.xn--9y2br3k43n.kr' }), true);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site' }), true, 'Origin 이 없는 same-site 도 막는다');
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site', origin: 'null' }), true);
});

test('same-site 라도 Origin 이 샘링크 자기 호스트(www 포함)면 통과', () => {
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site', origin: 'https://www.xn--9y2br3k43n.kr' }), false);
  assert.equal(call('POST', { 'sec-fetch-site': 'same-site', origin: 'https://xn--9y2br3k43n.kr' }), false);
});

test('다른 사이트·직접 입력(none)은 막는다', () => {
  assert.equal(call('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }), true);
  assert.equal(call('POST', { 'sec-fetch-site': 'none' }), true);
  assert.equal(call('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://xn--9y2br3k43n.kr' }), true, '헤더를 믿는다');
});

test('Sec-Fetch-Site 가 없을 때: Origin 호스트로 비교, 둘 다 없으면 서버 간 호출(만료 정리 curl)이라 통과', () => {
  assert.equal(call('POST', { origin: 'https://www.xn--9y2br3k43n.kr' }), false);
  assert.equal(call('POST', { origin: 'https://evil.example' }), true);
  assert.equal(call('POST', { origin: 'null' }), true);
  assert.equal(call('POST', {}), false);
  assert.equal(call('POST', { origin: 'not a url' }), true);
});

test('www 는 같은 곳으로 본다', () => {
  assert.equal(siteHost('WWW.Example.KR'), 'example.kr');
});
