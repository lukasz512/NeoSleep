# Contract: arch → dba

> **What this file is**: A formal interface between the Software Architect skill and the DBA skill.
> When arch delegates a task to dba, it passes input in the format defined here.
> When dba completes, it returns output in the format defined here.
> This prevents ambiguous handoffs and makes orchestration predictable.
>
> Think of this as a TypeScript interface for skill-to-skill communication.

---

## When arch calls dba

Arch delegates to dba when:
- A new entity spec requires a migration (DB schema, indexes, constraints)
- A release gate requires migration review
- A drift report finds a missing index or schema violation
- A performance issue is suspected (query analysis needed)
- A rollback SQL needs to be written or validated

---

## INPUT FORMAT — arch → dba

Arch passes a structured task block. Use this exact format:

```markdown
## DBA Task: [task type]

**Context**: [1-2 sentences explaining why this task exists — the business or architectural reason]
**Priority**: [blocking / pre-UAT / this-sprint / backlog]
**References**: [link to entity spec, ADR, or drift report that triggered this]

### Task Type
[one of: new-table | add-index | migration-review | rollback-review | query-analysis | schema-audit]

### Input Data

#### New Table Request (if task type = new-table)
Entity: [entity name]
Schema: [platform | {tenant}]
Extends identities: [yes | no]
Personal data: [yes | no — if yes, which fields]
Estimated rows in 12 months: [rough estimate]

Fields:
| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | |
| [field] | [type] | [constraints] | [reason for type choice] |

Relationships:
- [entity] → [referenced entity] via [FK column] (ON DELETE [action])

Query patterns (most common access patterns — drives index design):
1. [most frequent query description, e.g. "filter by status + created_at range"]
2. [second most frequent]
3. [JSONB field queries if any]

#### Migration Review Request (if task type = migration-review)
Migration file: [path]
Summary of changes: [what this migration does]
Rollback SQL present: [yes | no]
Tested locally: [yes | no]
Production risk: [low | medium | high] and why

#### Query Analysis Request (if task type = query-analysis)
Query: [SQL or TypeScript DB function code]
Table size estimate: [rows]
Current EXPLAIN ANALYZE output: [paste or "not yet run"]
Performance target: [e.g. "< 50ms at 100k rows"]
```

---

## OUTPUT FORMAT — dba → arch

DBA returns a structured response. Use this exact format:

```markdown
## DBA Response: [task type]

**Status**: [complete | needs-clarification | blocked]
**Blocking on**: [only if status = blocked — what dba needs from arch]

### Migration SQL

\`\`\`sql
-- [description of what this does]
-- Migration: [number]_[entity].sql

[full migration SQL]
\`\`\`

### Rollback SQL

\`\`\`sql
-- Rollback for [number]_[entity].sql
-- Run ONLY if migration must be reversed in production
-- Preconditions: [any data that must be cleaned first]

[full rollback SQL]
\`\`\`

### Indexes Created

| Index name | Columns | Type | Justification |
|---|---|---|---|
| idx_[entity]_[column] | [columns] | [btree/gin/brin] | [which query pattern this serves] |

### Red Flags Found (if any)

| Severity | Issue | Recommendation |
|---|---|---|
| [🔴/🟡/🔵] | [what was found] | [what to do] |

### EXPLAIN ANALYZE Result (if query analysis requested)

\`\`\`
[EXPLAIN ANALYZE output]
\`\`\`

**Assessment**: [1-2 sentences — is this query acceptable? What's the bottleneck?]
**Recommendation**: [specific SQL change or index addition]

### Checklist — DBA Sign-Off

\`\`\`
□ Migration SQL reviewed and correct
□ Rollback SQL tested locally on clean DB
□ All FK columns have indexes
□ No SELECT * in production queries
□ JSONB fields: GIN index added if queried with ->>/@ >
□ VARCHAR(n) limits are meaningful, not arbitrary
□ Personal data fields: encryption noted if required
□ Migration file numbered correctly (next in sequence)
□ No ON DELETE CASCADE on business data
\`\`\`
```

---

## Escalation Rules

DBA escalates back to arch when:
- The schema design requires an architectural decision (e.g., should this be in platform or tenant schema?)
- A new partition strategy is needed (arch must write ADR first)
- A migration would require downtime > 5 minutes (arch must approve window)
- The rollback is destructive (data loss) — arch must sign off explicitly

DBA does NOT make architectural decisions. DBA implements the schema arch specifies and flags problems.

---

## SLA

| Priority | DBA response target |
|---|---|
| blocking | Same session |
| pre-UAT | Within current working context |
| this-sprint | Next invocation |
| backlog | Tracked in tech debt, no SLA |
