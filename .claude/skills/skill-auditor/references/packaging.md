# Packaging checks (formerly skill-doctor)

Run these alongside the rubric. Every skill's name+description is injected into every session, so cost matters.

1. SKILL.md length: `wc -l .claude/skills/*/SKILL.md | sort -rn`. Target <200 lines; hard guidance 500. Move detail to `references/` or `assets/`, linked from the body.
2. Description length: per skill, count the characters of the `description:` line. Per-skill cap 1536 chars; aim <350. Sum all descriptions; the listing budget is ~1% of the context window.
3. Weak descriptions: flag any without a "Use when..." clause, with fewer than 2-3 trigger words distinct from the skill name, or with trigger words buried after a preamble. Front-load what + when.
4. Usage: skills never invoked across recent sessions are merge or delete candidates (judgment call, flag it).
5. No invocation telemetry is available from here; use session logs if the request needs it.
