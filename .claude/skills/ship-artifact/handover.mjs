// Pure helpers for the handover text (CORE-247): the before/after of a change has to be
// readable on the board card itself, without opening the Artifact. build.mjs runs its CLI
// on import, so what the tests need lives here.
// English only (CLAUDE.md). No dependencies beyond Node.

const plain = (value) =>
  String((value && typeof value === "object" ? value.text : value) ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * One shape for every way a change states its before/after: the full `beforeAfter` table,
 * the `before` + `after` shorthand for a changed element, or `added` for a new one.
 * Null when the content has none of them.
 */
export function normalizeBeforeAfter(c = {}) {
  if (c.beforeAfter?.rows?.length) return c.beforeAfter;
  if (c.before && c.after) return { rows: [["Change", c.before, c.after]] };
  if (c.added) return { columns: ["New"], rows: [[c.added]] };
  return null;
}

/** The table as plain-text lines for a board comment; rows beyond `max` are counted, not listed. */
export function beforeAfterLines(ba, max = 5) {
  if (!ba?.rows?.length) return [];
  const lines = ba.rows.slice(0, max).map((row) => {
    const cells = row.map(plain);
    if (cells.length === 1) return `- New: ${cells[0]}`;
    if (cells.length === 2) return `- ${cells[0]} → ${cells[1]}`;
    return `- ${cells[0]}: ${cells.slice(1, -1).join(" / ")} → ${cells.at(-1)}`;
  });
  if (ba.rows.length > max) lines.push(`+${ba.rows.length - max} more in the Artifact`);
  return lines;
}

/** The one board comment of a light (non-UI) handover. */
export function lightComment({ summary, lines = [], pr, branch }) {
  return [plain(summary), ...(lines.length ? ["", "Before → after:", ...lines] : []), "", `PR: ${pr}`, `Branch: \`${branch}\``].join("\n");
}

/** A warning from the third render of the same ticket on: each one re-reads the whole context. */
export function renderWarning(renders) {
  return renders > 2
    ? `render #${renders} for this ticket: every render + publish is another full-context turn. Batch the remaining fixes into one last render (ship-artifact: render once after the push, publish at most twice).`
    : null;
}
