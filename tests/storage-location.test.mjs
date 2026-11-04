import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-11-04: 계정에 저장된 줄 알았는데 브라우저에만 있던 일을 막는 장치들이 되돌아오지 않게.
const page = await readFile('app/page.tsx', 'utf8');

test('연결 안 된 브라우저에서 처음 만들면 저장 위치를 묻고, 계정을 고르면 만든 뒤 연결한다', () => {
  assert.match(page, /if \(await shouldAskStorage\(\)\)/);
  assert.match(page, /\(await createLink\(form\)\) && !\(await startAccountConnect\(\)\)/);
  assert.match(page, /if \(isEmbedded\) return false;/);
});

test('결과 칸은 어디에 저장되는지 늘 보여 준다', () => {
  assert.match(page, /이 브라우저에만 저장돼요/);
  assert.match(page, /아지트 계정에 저장돼요/);
});

test('서버가 404 라고 해도 브라우저 목록에서 저절로 지우지 않는다', () => {
  assert.doesNotMatch(page, /if \(deletedSlugs\.has\(link\.slug\)\) return false;/);
  assert.match(page, /setUnavailableSlugs\(\[\.\.\.deletedSlugs\]\)/);
  assert.match(page, /removeSavedLinkLocally\(link\.slug\)/);
});

test('연결 화면은 옮긴 개수를 0개여도 알린다', async () => {
  assert.match(await readFile('app/connect/page.tsx', 'utf8'), /계정에 담을 링크가 없었어요/);
});

test('계정에 못 넣으면 숨기지 않고 알린다', async () => {
  const shorten = await readFile('app/api/shorten/route.ts', 'utf8');
  assert.match(shorten, /accountSaveFailed = true/);
  assert.match(page, /isAccountConnected && !result\.accountSaveFailed/);
});

test('묻는 창: 연타 막기, Esc·Tab 은 창 기준, 취소하면 대기 폼을 비운다', () => {
  assert.match(page, /isSubmitGateBusy\.current \|\| isSubmitting \|\| isStoragePromptOpen/);
  assert.match(page, /window\.addEventListener\("keydown", onKey\)/);
  assert.match(page, /function closeStoragePrompt\(\) \{\s+setIsStoragePromptOpen\(false\);\s+pendingForm\.current = null;/);
});
