// node --test .claude/skills/ship-artifact/ticket.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketFromBranch, ticketTeams } from "./ticket.mjs";

test("reads NEO and CORE from .claude/ticket-teams", () => {
  const teams = ticketTeams();
  assert.ok(teams.includes("NEO"));
  assert.ok(teams.includes("CORE"));
});

test("finds the ticket for each team key", () => {
  assert.equal(ticketFromBranch("worktree-neo-163-linking"), "NEO-163");
  assert.equal(ticketFromBranch("worktree-core-23-team-split"), "CORE-23");
  assert.equal(ticketFromBranch("worker/CORE-7-prefs"), "CORE-7");
});

test("ignores unknown keys and look-alikes", () => {
  assert.equal(ticketFromBranch("claude/laughing-fermat-w6onh8"), null);
  assert.equal(ticketFromBranch("worktree-ajm-4-x"), null);
  assert.equal(ticketFromBranch("worktree-neosleep-9"), null);
});

test("a new team key only needs the file", () => {
  assert.equal(ticketFromBranch("worktree-ajm-4-x", ["NEO", "CORE", "AJM"]), "AJM-4");
});

test("falls back to NEO when the file is missing", () => {
  assert.deepEqual(ticketTeams("/nonexistent/ticket-teams"), ["NEO"]);
});
