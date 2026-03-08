# 🤖 AI OPERATING MODE

This project is AI-assisted by design.

## Core documents for AI
- `/foundation/docs/ARCHITECTURE_BIBLE.md`
- `/foundation/docs/EXECUTION_MAP.md`
- `/foundation/docs/PROJECT_STATE.md`
- `/foundation/docs/AI_PLAYBOOK.md`
- `/foundation/specs/`
- `/foundation/adrs/`

## Workflow
1. Define or update SPEC.
2. Ask AI to implement feature.
3. AI generates:
   - Code
   - Tests
   - Doc updates
   - Event updates
4. CI validates.
5. PROJECT_STATE.md updated.

## Asking AI good questions

Instead of:
> build auth

Ask:
> Implement SPEC-0002 with tests and update PROJECT_STATE.md if Stage 1 DoD satisfied.

---

This ensures deterministic and structured evolution of the platform.
