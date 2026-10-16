import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 2026-10-14: 아지트 계정에 연결하면 연구소에서 끈 개요 모음 링크(is_active=false)가 내 링크에 회색으로 계속 남았다.
// 브라우저 저장 링크는 멈추면 빠지는데 계정 링크만 남아 기준이 달랐다.
test('합친 링크 목록은 멈춘 계정 링크를 빼고, 브라우저 저장 링크와 같은 기준을 쓴다', async () => {
  const page = await readFile('app/page.tsx', 'utf8');
  assert.match(page, /for \(const link of myLinks\) \{[\s\S]{0,400}?if \(link\.isActive === false\) \{\s*map\.delete\(link\.slug\);\s*continue;\s*\}/);
  // 브라우저 저장 링크 쪽 기준(통계에서 멈춤이면 뺀다)도 그대로여야 한다.
  assert.match(page, /if \(statsForLink && statsForLink\.isActive === false\) return false;/);
});
