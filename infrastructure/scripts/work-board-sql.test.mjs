import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImportSql, lit } from "./work-board-sql.mjs";

test("lit quotes text safely and keeps numbers and NULL", () => {
  assert.equal(lit("O'Brien"), "'O''Brien'");
  assert.equal(lit("a\u0000b"), "'ab'");
  assert.equal(lit(null), "NULL");
  assert.equal(lit(3), "3");
  assert.throws(() => lit(Number.NaN));
});

const slim = [
  {
    item: {
      team_key: "NEO", number: 7, title: "Don't break", problem: "P", change: null, done_when: null, status: "done",
      priority: 2, labels: ["Bug"], links: [{ kind: "pr", url: "https://github.com/x/pull/1" }], branch: null,
      linear_identifier: "NEO-7", created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-02T00:00:00Z",
    },
    comments: [{ body: "Decision: it's fine", created_at: "2026-09-01T10:00:00Z" }],
  },
];

test("every item insert is idempotent and its events hang off the inserted row only", () => {
  const sql = buildImportSql(slim, { exportedAt: "2026-10-07" });
  assert.match(sql, /ON CONFLICT DO NOTHING\s+RETURNING id/);
  assert.match(sql, /'Don''t break'/);
  assert.match(sql, /'Decision: it''s fine', 'linear', 'import'/);
  assert.equal((sql.match(/FROM ins/g) ?? []).length, 2);
  assert.match(sql, /GREATEST\(t\.next_number, m\.max_number \+ 1\)/);
  assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
});
