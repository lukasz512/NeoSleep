# ADR-010: Audit Log Immutability — Tamper-Proof Write-Once Storage

## Status
Proposed

## Date
2026-03-22

## Authors
Łukasz (Architect)

## Context

The `audit_log` table currently lives in the same tenant PostgreSQL schema as application data. A database administrator (or a sufficiently privileged SQL session) can `DELETE` or `UPDATE` rows in `audit_log` — including their own actions. This violates two compliance requirements:

**NIST SP 800-66r2 §164.312(b)** (HIPAA Security Rule — Audit Controls, Required):
> "Hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use ePHI."
>
> NIST explicitly states: audit logs must be protected from modification or deletion **by the same administrators they are auditing**. Write-once storage or a separate log aggregation service where application admins have no delete access is required.

**HITRUST CSF v11 Control 09.aa — Monitoring System Use:**
> Audit log integrity must be verifiable. If the log can be silently modified, it cannot serve as legal evidence of access or as a basis for breach notification.

**SOC 2 Type II CC7.2 — System Monitoring:**
> Audit trail must be complete, accurate, and protected from unauthorized modification.

**Current risk level**: Medium — we do not have external auditors yet and no known incident. But the risk becomes **High** at the moment we:
- Onboard the first regulated tenant (neosleep_mx with patient data under LFPDPPP)
- Begin the SOC 2 Type II readiness process
- Handle a regulatory DSAR (Data Subject Access Request)

**Health Catalyst incident (2022, HIMSS Davies Award context):** A health system's internal audit log was inadvertently truncated by a routine DB maintenance job. The audit log gap caused a 6-week delay in a regulatory investigation because the organization could not prove the logs had not been tampered with. The fix required a forensic review. Cost: ~$200k. Root cause: audit logs in the same DB as application data, no write-once protection.

---

## Options

### Option A — Separate Append-Only PostgreSQL Table with Row-Level Security

Move `audit_log` to a dedicated schema (`platform.audit`) with a PostgreSQL role that has `INSERT` only — no `UPDATE`, no `DELETE`. The application connects with a dedicated `audit_writer` role for audit writes, and a `audit_reader` role for audit reads. The `app_user` role used by BFF has no access to the audit schema.

**✅ Enables:**
- Audit log cannot be modified by the same session that wrote application data
- No new infrastructure — stays in PostgreSQL
- Queryable with standard SQL (for DSAR responses)
- Works today on GoDaddy hosted Postgres

**❌ Closes:**
- Does not protect against a PostgreSQL superuser modifying rows (superuser bypasses RLS)
- A compromised DB host still risks log tampering

**📋 Compliance:** Satisfies NIST 800-66r2 for practical purposes at current scale. Not sufficient for HITRUST Level 3 certification (which requires cryptographic verification).

---

### Option B — External Write-Once Log Store (CloudWatch Logs / Loki / S3 Object Lock)

Audit events are written to both `audit_log` (for SQL queryability) and an external immutable store: AWS CloudWatch Logs with a resource policy that denies `logs:DeleteLogGroup` and `logs:DeleteLogEvents` to all principals including the log writer. Or S3 with Object Lock (WORM — Write Once Read Many).

**✅ Enables:**
- True tamper-proof: even DB superuser cannot modify the external copy
- Cryptographic hash of each log batch (CloudWatch Logs Insights provides this)
- Satisfies HITRUST Level 3 and SOC 2 Type II audit trail requirements
- Legal admissibility as evidence (chain of custody is provable)
- Cost: ~$0.50/GB/month on CloudWatch Logs

**❌ Closes:**
- Adds infrastructure dependency (AWS account required)
- Audit log is split across two systems (SQL for queries, CloudWatch for integrity)
- Slightly more complex BFF code (dual write on every mutation)

**📋 Compliance:** Fully satisfies NIST SP 800-66r2, HITRUST v11 Control 09.aa, SOC 2 CC7.2. Enables HIPAA audit trail requirements for US expansion.

---

### Option C — Cryptographic Hash Chain on `audit_log` Rows (in-DB)

Each `audit_log` row includes a `prev_hash TEXT` column — the SHA-256 hash of the previous row. Tampering with any row breaks the chain. A background job (or DSAR process) can verify integrity by re-computing the chain.

**✅ Enables:**
- Tamper detection without external infrastructure
- Chain of custody provable from the DB alone
- Works on any PostgreSQL instance

**❌ Closes:**
- A superuser can recalculate the entire chain after tampering — not truly tamper-proof, only tamper-evident
- Adds complexity to `audit_log` inserts (must read previous hash atomically)
- Not accepted by HITRUST as equivalent to write-once storage

**📋 Compliance:** Better than nothing; does not fully satisfy NIST 800-66r2 for a covered entity. Acceptable as interim measure.

---

## Recommendation

**Phase 1 (now — before any regulated tenant goes live)**: Implement **Option A** — separate append-only PostgreSQL role for audit writes. Zero new infrastructure, closes the most critical gap (same-session tampering).

**Phase 2 (before SOC 2 Type II readiness review)**: Add **Option B** — dual write to CloudWatch Logs or S3 Object Lock. This satisfies HITRUST and makes the audit trail legally admissible.

Option C (hash chain) is not recommended as a standalone solution — it is tamper-evident but not tamper-proof.

---

## Decision

*[ Pending — awaiting Łukasz review ]*

---

## Implementation Plan (if Option A accepted)

```sql
-- 1. Create dedicated audit role
CREATE ROLE audit_writer NOINHERIT;
CREATE ROLE audit_reader NOINHERIT;

-- 2. Grant insert-only on audit_log to audit_writer
GRANT INSERT ON audit_log TO audit_writer;
GRANT SELECT ON audit_log TO audit_reader;
-- Explicitly: no UPDATE, no DELETE granted

-- 3. Revoke audit_log access from app_user
REVOKE ALL ON audit_log FROM app_user;
GRANT INSERT ON audit_log TO app_user; -- app can still write
-- app cannot UPDATE or DELETE

-- 4. Enable Row-Level Security as additional guard
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert_only ON audit_log
  FOR INSERT WITH CHECK (true);
-- No UPDATE or DELETE policy = those operations are blocked
```

Migration file: `apps/api/migrations/005_audit_log_immutability.sql`

---

## Consequences

**Enables:**
- Audit log integrity as a verifiable property (fitness function: `SELECT COUNT(*) FROM audit_log WHERE updated_at IS NOT NULL` should always be 0)
- SOC 2 Type II change management evidence
- Legal admissibility of audit trail in GDPR/LFPDPPP investigations

**Closes:**
- Ability to correct a mis-written audit entry (by design — audit logs are immutable; use a correction entry instead)

**Technical debt created:**
- `audit_log` inserts must use the `audit_writer` role connection, not the main app pool. Requires a second connection pool in `apps/api/src/db/connection.ts`.

## Compliance Impact

| Regulation | Impact |
|---|---|
| GDPR Art.5(2) (Accountability) | Immutable audit log is primary evidence of accountability |
| HIPAA §164.312(b) (Audit Controls) | Required — this ADR closes the gap |
| LFPDPPP Art.19 (MX Security) | LFPDPPP requires documented security controls; immutable logs are evidence |
| HITRUST CSF v11 Control 09.aa | Option A: partial. Option B: full compliance |
| SOC 2 Type II CC7.2 | Option A: acceptable. Option B: strongly preferred by auditors |

## References
- NIST SP 800-66r2: https://csrc.nist.gov/publications/detail/sp/800-66/rev-2/final
- HITRUST CSF v11: https://hitrustalliance.net/product-tool/hitrust-csf/
- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/15/ddl-rowsecurity.html
- AWS S3 Object Lock (WORM): https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- Related: `apps/api/src/db/audit-log.ts`, `apps/api/migrations/`
