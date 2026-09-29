// Ticket-ID parsing shared by build.mjs (CORE-23). Team keys come from
// .claude/ticket-teams, the same file the shell hooks read; NEO is the fallback.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEAMS_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../ticket-teams");

export function ticketTeams(file = TEAMS_FILE) {
  try {
    const keys = readFileSync(file, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    return keys.length ? keys : ["NEO"];
  } catch {
    return ["NEO"];
  }
}

export function ticketFromBranch(branch, teams = ticketTeams()) {
  const re = new RegExp(`\\b((?:${teams.join("|")})-\\d+)\\b`, "i");
  return (String(branch ?? "").match(re)?.[1] ?? "").toUpperCase() || null;
}
