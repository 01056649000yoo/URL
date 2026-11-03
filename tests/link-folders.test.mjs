import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeFolders, sanitizeFolders, MAX_FOLDERS } from '../lib/link-folders.ts';

// 링크 폴더 구성을 계정에 저장할 때의 정리·합치기 규칙(2026-11-03).

test('모양이 틀린 폴더는 버리고 이름은 30자로 자른다', () => {
  const result = sanitizeFolders([
    { id: 'a', name: '  3학년 사회  ', slugs: ['x', 1, '', 'y'] },
    { id: 'bad id!', name: '버림', slugs: [] },
    { id: 'c', name: 5, slugs: [] },
    null,
    { id: 'd', name: '가'.repeat(40), slugs: 'not-array' },
  ]);
  assert.deepEqual(result, [
    { id: 'a', name: '3학년 사회', slugs: ['x', 'y'] },
    { id: 'd', name: '가'.repeat(30), slugs: [] },
  ]);
});

test('배열이 아니면 빈 목록, 폴더 수는 상한까지만', () => {
  assert.deepEqual(sanitizeFolders({}), []);
  const many = Array.from({ length: MAX_FOLDERS + 5 }, (_, i) => ({ id: `f${i}`, name: `폴더${i}`, slugs: [] }));
  assert.equal(sanitizeFolders(many).length, MAX_FOLDERS);
});

test('같은 링크가 두 폴더에 있으면 먼저 나온 폴더만 가진다, 같은 id 폴더는 하나만', () => {
  const result = sanitizeFolders([
    { id: 'a', name: 'A', slugs: ['s1'] },
    { id: 'b', name: 'B', slugs: ['s1', 's2'] },
    { id: 'a', name: 'A2', slugs: ['s3'] },
  ]);
  assert.deepEqual(result, [
    { id: 'a', name: 'A', slugs: ['s1'] },
    { id: 'b', name: 'B', slugs: ['s2'] },
  ]);
});

test('합치기: 계정 쪽 이름을 쓰고 링크는 합치며, 이 브라우저에만 있던 폴더는 뒤에 붙인다', () => {
  const account = [{ id: 'a', name: '계정 이름', slugs: ['s1'] }];
  const local = [
    { id: 'a', name: '브라우저 이름', slugs: ['s2', 's1'] },
    { id: 'b', name: '새 폴더', slugs: ['s3'] },
  ];
  assert.deepEqual(mergeFolders(account, local), [
    { id: 'a', name: '계정 이름', slugs: ['s1', 's2'] },
    { id: 'b', name: '새 폴더', slugs: ['s3'] },
  ]);
  // 원본은 바꾸지 않는다
  assert.deepEqual(account, [{ id: 'a', name: '계정 이름', slugs: ['s1'] }]);
});

import { planFolderSync } from '../lib/link-folders.ts';

const A = [{ id: 'a', name: '계정 폴더', slugs: ['s1'] }];
const L = [{ id: 'b', name: '브라우저 폴더', slugs: ['s2'] }];

test('같은 계정과 맞춰 본 브라우저: 계정 것이 기준 — 다른 기기에서 지운 폴더가 되살아나지 않는다', () => {
  const plan = planFolderSync({ accountFolders: A, accountVersion: 3, accountKey: 'k1', localFolders: [...A, ...L], localOwner: 'k1' });
  assert.deepEqual(plan.next, A);
  assert.equal(plan.needsPush, false);
});

test('다른 기기에서 옮긴 링크가 예전 폴더로 돌아가지 않는다', () => {
  const account = [{ id: 'a', name: 'A', slugs: [] }, { id: 'b', name: 'B', slugs: ['s1'] }];
  const local = [{ id: 'a', name: 'A', slugs: ['s1'] }, { id: 'b', name: 'B', slugs: [] }];
  assert.deepEqual(planFolderSync({ accountFolders: account, accountVersion: 2, accountKey: 'k1', localFolders: local, localOwner: 'k1' }).next, account);
});

test('처음 연결한 브라우저: 계정 것에 브라우저 폴더를 한 번 합치고 올린다', () => {
  const plan = planFolderSync({ accountFolders: A, accountVersion: 1, accountKey: 'k1', localFolders: L, localOwner: null });
  assert.deepEqual(plan.next, [...A, ...L]);
  assert.equal(plan.needsPush, true);
});

test('계정에 아직 없으면 브라우저 폴더를 올리고, 둘 다 비면 올리지 않는다', () => {
  assert.equal(planFolderSync({ accountFolders: [], accountVersion: 0, accountKey: 'k1', localFolders: L, localOwner: null }).needsPush, true);
  assert.equal(planFolderSync({ accountFolders: [], accountVersion: 0, accountKey: 'k1', localFolders: [], localOwner: null }).needsPush, false);
});

test('다른 계정과 맞춰 본 폴더는 새 계정에 섞지 않는다', () => {
  const plan = planFolderSync({ accountFolders: [], accountVersion: 0, accountKey: 'k2', localFolders: L, localOwner: 'k1' });
  assert.deepEqual(plan.next, []);
  assert.equal(plan.needsPush, false);
  assert.deepEqual(planFolderSync({ accountFolders: A, accountVersion: 4, accountKey: 'k2', localFolders: L, localOwner: 'k1' }).next, A);
});

import { rebaseFolders } from '../lib/link-folders.ts';

test('3방향 합치기: 양쪽이 각자 만든 폴더를 모두 살린다', () => {
  const base = [{ id: 'a', name: 'A', slugs: [] }];
  const mine = [...base, { id: 'm', name: '내 폴더', slugs: [] }];
  const theirs = [...base, { id: 't', name: '다른 기기 폴더', slugs: [] }];
  assert.deepEqual(rebaseFolders(base, mine, theirs).map((f) => f.id), ['a', 't', 'm']);
});

test('3방향 합치기: 한쪽이 지운 폴더는 지우고, 옮긴 링크는 옮긴 쪽을 따른다', () => {
  const base = [{ id: 'a', name: 'A', slugs: ['s1', 's2'] }, { id: 'b', name: 'B', slugs: [] }];
  const mine = [{ id: 'a', name: 'A', slugs: ['s2'] }, { id: 'b', name: 'B', slugs: ['s1'] }];
  const theirs = [{ id: 'a', name: 'A 새이름', slugs: ['s1', 's2'] }];
  // 다른 기기가 b 를 지웠고, 나는 s1 을 b 로 옮겼다 → b 는 사라지고 s1 은 미분류, 이름은 다른 기기 것
  assert.deepEqual(rebaseFolders(base, mine, theirs), [{ id: 'a', name: 'A 새이름', slugs: ['s2'] }]);
});

test('저장 못 한 이 브라우저 변경은 다음 연결 때 계정 최신 위에 다시 얹는다', () => {
  const base = [{ id: 'a', name: 'A', slugs: [] }];
  const local = [{ id: 'a', name: 'A', slugs: [] }, { id: 'n', name: '못 올린 폴더', slugs: [] }];
  const account = [{ id: 'a', name: 'A', slugs: [] }, { id: 'x', name: '다른 기기', slugs: [] }];
  const plan = planFolderSync({ accountFolders: account, accountVersion: 5, accountKey: 'k1', localFolders: local, localOwner: 'k1', localBase: base });
  assert.deepEqual(plan.next.map((f) => f.id), ['a', 'x', 'n']);
  assert.equal(plan.needsPush, true);
});
