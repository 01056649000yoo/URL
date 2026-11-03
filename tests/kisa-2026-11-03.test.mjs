import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { checkUrlsSafety } from '../lib/safe-browsing.ts';

// 2026-11-03 KISA 21개 항목 점검에서 고친 것들이 되돌아오지 않게 지키는 검사.

test('악성 주소 검사: API 가 계속 실패하면 안전으로 치지 않고 "검사 못 함"', async () => {
  const original = globalThis.fetch;
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key';
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; throw new Error('down'); };
    assert.deepEqual(await checkUrlsSafety(['https://example.com']), { safe: false, unavailable: true });
    assert.equal(calls, 2); // 한 번 다시 묻는다
    calls = 0;
    globalThis.fetch = async () => { calls += 1; return calls === 1 ? new Response('', { status: 503 }) : new Response('{}', { status: 200 }); };
    assert.deepEqual(await checkUrlsSafety(['https://example.com']), { safe: true });
    globalThis.fetch = async () => new Response(JSON.stringify({ matches: [{ threatType: 'MALWARE' }] }), { status: 200 });
    assert.deepEqual(await checkUrlsSafety(['https://example.com']), { safe: false, threatType: 'MALWARE' });
  } finally {
    globalThis.fetch = original;
    delete process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  }
  const shorten = await readFile('app/api/shorten/route.ts', 'utf8');
  assert.match(shorten, /safety\.unavailable[\s\S]{0,300}status: 503/);
});

test('기기 쿠키: 서명 없는 옛 device_<uuid> 값을 더 인정하지 않는다', async () => {
  const src = await readFile('lib/device-cookie.ts', 'utf8');
  assert.doesNotMatch(src, /\/\^device_\[0-9a-f-\]\{36\}\$\/\.test\(existing\)\) return \{ deviceId: existing/);
});

test('계정 세션: v2 세션 id·90일·연결 해제 때 서버 폐기, 화면 열 때 v1 을 v2 로', async () => {
  const session = await readFile('lib/account-session.ts', 'utf8');
  const disconnect = await readFile('app/api/account/disconnect/route.ts', 'utf8');
  const account = await readFile('app/api/account/route.ts', 'utf8');
  assert.match(session, /ACCOUNT_MAX_AGE_SECONDS = 60 \* 60 \* 24 \* 90/);
  assert.match(session, /account_session_revocations/);
  assert.match(disconnect, /revokeAccountSession/);
  assert.match(account, /if \(account\.legacy\) setAccountSession\(response, account, account\.expires\)/);
  // v1 도 서명에서 뽑은 고정 세션 id 로 폐기 확인을 받는다
  assert.match(session, /samlink-v1-session\|/);
  assert.doesNotMatch(session, /if \(!session\?\.sessionId\) return session/);
});

test('내부 오류 문구를 응답에 싣지 않는다(API 전체)', async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'route.ts') files.push(path);
    }
  };
  await walk('app/api');
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    assert.doesNotMatch(src, /json\(\{ error: message \}/, file);
  }
  const login = await readFile('app/api/admin/login/route.ts', 'utf8');
  assert.match(login, /typeof body\?\.email === "string"/);
});

test('만료 정리는 POST 만, QR 은 횟수 제한, 별명은 만든 사람만', async () => {
  assert.doesNotMatch(await readFile('app/api/cleanup-expired/route.ts', 'utf8'), /export async function GET/);
  assert.match(await readFile('app/api/qr/route.ts', 'utf8'), /QR_LIMIT_PER_MINUTE/);
  assert.match(await readFile('app/api/my-links/label/route.ts', 'utf8'), /if \(!access\.isOwner\)/);
});

test('형식이 틀린 요청은 500 이 아니라 400(배포 점검에서 발견)', async () => {
  const shorten = await readFile('app/api/shorten/route.ts', 'utf8');
  assert.match(shorten, /\["destination", "slug", "retentionPeriod", "bundleTitle"\]\.some/);
  assert.match(shorten, /typeof item\.url !== "string"/);
  for (const file of ['app/api/my-links/extend/route.ts', 'app/api/my-links/transfer/route.ts', 'app/api/admin/links/bulk-delete/route.ts', 'app/api/admin/links/[id]/route.ts']) {
    assert.match(await readFile(file, 'utf8'), /request\.json\(\)\.catch\(\(\) => null\)/, file);
  }
});
