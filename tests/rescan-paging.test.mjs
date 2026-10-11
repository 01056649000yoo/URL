import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 2026-10-11 보안 점검: 매일 재검사가 5,000개까지만 읽어 그 뒤 링크는 검사 밖이었다.
test('재검사는 번호 순서로 1,000개씩 끝까지 넘겨 읽고, 상한을 넘으면 오류로 알린다', async () => {
  const src = await readFile('app/api/rescan-links/route.ts', 'utf8');
  assert.doesNotMatch(src, /\.limit\(5000\)/);
  assert.match(src, /\.gt\("id", lastId\)/);
  assert.match(src, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(src, /PAGE_SIZE = 1000/);
  assert.match(src, /MAX_LINKS = 50_000/);
  assert.match(src, /if \(page\.length < PAGE_SIZE\) break;/);
});
