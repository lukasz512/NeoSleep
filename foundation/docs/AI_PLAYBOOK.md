# AI PLAYBOOK – How AI Works With This Project

This document defines how AI (Cursor/Copilot/LLM) should operate.

---

## 1️⃣ SPEC-FIRST RULE

Never implement a feature without:
- Existing SPEC in `/foundation/specs`
- Clear acceptance criteria
- Defined test plan

If missing → ask for clarification.

---

## 2️⃣ PR REQUIREMENTS

Every PR must:
- Implement SPEC requirements
- Add/update unit tests
- Add/update E2E tests if UI flow
- Update module docs
- Update PROJECT_STATE.md if stage complete

---

## 3️⃣ ARCHITECTURE CHANGES

If implementation affects:
- Data model
- Auth model
- Multi-tenant config
- API contract

AI must:
- Create new ADR file in `/foundation/adrs`
- Reference it in PR description

---

## 4️⃣ EVENT LOGGING RULE

All new UI flows must:
- Emit events according to `EVENT_TAXONOMY.md`
- Avoid sensitive data in payloads

---

## 5️⃣ i18n RULE

- No hardcoded strings in UI.
- All labels use i18n keys.
- Run extraction pipeline if new keys added.

---

## 6️⃣ SECURITY RULE

- No secrets in frontend.
- RBAC enforced in BFF.
- No raw medical data in logs.

---

## 7️⃣ HOW AI DECIDES NEXT STEP

When asked “what next?”:
1. Read EXECUTION_MAP.md
2. Read PROJECT_STATE.md
3. Propose next incomplete stage
4. Generate implementation plan
5. Generate tests + doc updates

---

## 8️⃣ CODE STYLE

- TypeScript strict
- Modular architecture
- Avoid magic values
- Clear separation of app / service / config layers

---

AI is not allowed to:
- Bypass tests
- Skip documentation
- Modify architecture without ADR
