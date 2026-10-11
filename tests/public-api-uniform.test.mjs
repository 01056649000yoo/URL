import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 2026-10-11 보안 점검: 공개 API 가 "있는 링크/없는 링크" 를 다르게 답하면 짧은 주소를 제한 없이 찾아낼 수 있다.
test('link-stats·extend: 없는 링크와 권한 없는 링크가 같은 404 하나로만 답한다', async () => {
  for (const file of ['app/api/link-stats/[slug]/route.ts', 'app/api/my-links/extend/route.ts']) {
    const src = await readFile(file, 'utf8');
    assert.match(src, /error \|\| !link \|\| !\(await deviceCanManageLink\(admin, viewer, link\)\)/, `${file}: 한 조건으로 합쳐야 한다`);
    assert.doesNotMatch(src, /권한이 없습니다\.[^}]*status: 403|status: 403[^}]*권한이 없습니다/, `${file}: 권한 없음 403 금지`);
  }
});

test('공개 라우트는 DB 오류 문구를 응답에 싣지 않고 공통 도우미(serverError)로 일반 문구만 준다', async () => {
  const helper = await readFile('lib/api-error.ts', 'utf8');
  assert.match(helper, /console\.error/);
  assert.match(helper, /서버 오류가 발생했습니다/);
  for (const file of ['app/api/link-stats/[slug]/route.ts', 'app/api/my-links/extend/route.ts', 'app/api/my-links/label/route.ts', 'app/api/my-links/[slug]/route.ts', 'app/api/my-links/route.ts', 'app/api/stats/route.ts', 'app/api/cleanup-expired/route.ts']) {
    const src = await readFile(file, 'utf8');
    assert.doesNotMatch(src, /error: (error|message|totalResult\.error|activeResult\.error)(\.message)? \}, \{ status: 500/, `${file}: 오류 문구 노출 금지`);
  }
});
