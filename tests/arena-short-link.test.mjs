import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("아레나 짧은 주소는 방 코드 모양만 받아 아레나로만 넘긴다", () => {
  const source = readFileSync("app/j/[code]/route.ts", "utf8");
  assert.match(source, /ARENA_BASE_URL = "https:\/\/arena\.xn--9y2br3k43n\.kr"/);
  assert.match(source, /ROOM_CODE = \/\^\[A-Za-z0-9\]\{4,8\}\$\//, "다른 주소로 새는 값을 막는다");
  assert.match(source, /redirect\(target, 302\)/, "방은 금방 사라지니 영구 이동으로 저장되지 않게");
  assert.doesNotMatch(source, /supabase|createAdminClient/, "링크를 저장하지 않는다");
});
