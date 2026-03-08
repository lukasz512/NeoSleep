# Cost, Google, and next steps (video calls, recording, notes)

Short guide: what to do next, how to keep costs low, and how Google Workspace relates to the app. Plus: video calls module and automatic meeting notes (recording + transcription).

---

## 1. What’s next (priority)

From **PROJECT_STATE.md** and current backlog:

| Order | Item | Notes |
|-------|------|--------|
| 1 | **Google OIDC (SPEC-0002)** | You already have “Sign in with Google” in BFF (`auth.ts`). Finish by setting `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in BFF `.env` and configuring the OAuth consent screen in Google Cloud Console. **No Google Workspace required** – any Gmail can sign in. |
| 2 | **Hetzner (or one VPS) for production** | Run Postgres + BFF + Directus in Docker on one small VPS (~€4–5/month). See DIRECTUS_DEV_AND_DEPLOY. |
| 3 | **Video calls module** | In-app video calls for reps/HCP. Options below; add to backlog. |
| 4 | **Recording + auto meeting notes** | Record calls, transcribe, generate notes. Options below; add to backlog. |
| 5 | Lead → partner flow, portal Contracts/Documents, admin theming | As in LEADS_AND_PARTNERS, THEMING_AND_PORTAL_APPEARANCE. |

---

## 2. Google Workspace ($7/user/month) – do you need it?

**Google Workspace** = company email (@yourdomain.com), Drive, Docs, Calendar, Meet, admin. You pay **per user**.

**Your app (“Sign in with Google”)** = uses **Google OAuth** (free). You register the app in **Google Cloud Console** (one project, no Workspace). Any Gmail (personal or Workspace) can sign in; users are stored in **your** DB (`tbl_users`). So:

- **You do not need Google Workspace** to have users log in with Google, use Gmail, or have multiple people in the app.
- **You need Workspace only if** you want: company email (@neosleepcare.com), shared Drive/Docs, or “only @neosleepcare.com can log in” (domain allowlist). That’s a business choice, not a technical requirement for login.

**Recommendation:** Start without Workspace. Use free Google OAuth; allowlist a few Gmail addresses in BFF for testing. Add Workspace later only if you want company email and domain control.

---

## 3. Where to run the database (and keep it cheap)

**Google Workspace is not a server.** You cannot run Docker or Postgres “on” Workspace. Workspace = email + docs + calendar + Meet.

**Cheap options for DB + app:**

| Option | Cost | What you get |
|--------|------|----------------|
| **Hetzner VPS** (e.g. CX22) | ~€4–5/month | One machine. Install Docker; run Postgres + BFF + Directus (same as local). One price for everything. |
| **Neon (DB only)** | $0 (free tier) | Managed Postgres. BFF + Directus would run elsewhere (e.g. Hetzner or Railway). |
| **Railway / Render** | Free tier or ~$5–7/month | Managed runtimes; you’d still need DB (Neon or included). |

**Practical path:** Use **one Hetzner VPS** and run everything there (Postgres + BFF + Directus in Docker). No per-user fee; you only pay for the server. That fits “w tej cenie” – one fixed monthly cost.

---

## 4. Video calls module (backlog)

**Goal:** In-app video calls (e.g. rep ↔ HCP) without paying per user if possible.

| Option | Cost | Notes |
|--------|------|--------|
| **Jitsi Meet** (self-hosted) | Server only (e.g. same Hetzner VPS) | Open source; embed in your app; no per-seat fee. You pay for the VM. |
| **Daily.co** | Free tier (e.g. 2,000 min/month), then paid | API to create rooms; embed in app. |
| **Twilio Video** | Per minute | Reliable; costs scale with usage. |
| **Whereby** | Free tier limited | Embeddable; paid for more. |
| **Google Meet** | Via Workspace or Meet API | Tied to Google; if you skip Workspace, use another option. |

**Recommendation:** For “taniej” and control, **Jitsi** on the same VPS (or a second small instance) is a good fit. Alternatively **Daily.co** free tier to start; migrate to Jitsi later if you want to avoid per-user or per-minute costs.

**Implementation (later):** Add a “Meeting” or “Video call” flow in rep-app (e.g. “Start call with HCP” → open Jitsi room or Daily room in iframe/modal). BFF can create room links or tokens; store meeting metadata in DB if needed.

---

## 5. Recording and automatic meeting notes (backlog)

**Goal:** Record video/audio of calls and generate meeting notes automatically.

**Rough flow:**

1. **Record** – Either in-browser (e.g. MediaRecorder + upload to BFF/storage) or server-side (e.g. Jitsi/Daily recording API if available).
2. **Transcribe** – Send audio to a transcription API (e.g. **OpenAI Whisper**, **AssemblyAI**, **Google Speech-to-Text**). Whisper has a paid API; self-hosted Whisper is free but needs a server.
3. **Summarize / notes** – Send transcript to an LLM (e.g. OpenAI, or open model) to produce structured meeting notes.

**Costs:** Transcription and LLM are per use (per hour of audio, per request). To keep costs down: limit recording to important calls; use Whisper self-hosted or a cheap tier; use a small/cheap model for notes.

**Implementation (later):** New module “Meeting notes” or extend “Video calls”: after a call, trigger “generate notes” (upload recording → BFF → transcription service → LLM → save to DB and show in app). Store recordings and notes in your DB (or object storage) and link to HCP/lead.

---

## 6. Summary

- **Next:** Wire Google OIDC (env vars + Cloud Console), then deploy to Hetzner (Docker).
- **Google Workspace:** Not required for login. Use it only if you want company email + Docs + Meet; otherwise stay with free OAuth + Gmail.
- **DB and “w tej cenie”:** One Hetzner VPS with Docker (Postgres + BFF + Directus) = single monthly cost, no per-user.
- **Video calls:** Plan a module (e.g. Jitsi or Daily); add to backlog; implement when ready.
- **Recording + notes:** Plan pipeline (record → transcribe → LLM notes); add to backlog; implement after or with video calls.

When you have Google Workspace, you still **don’t** run the database there; you run it on a VPS or managed DB. Workspace and the app are separate; the app just uses “Sign in with Google” (free) and optionally Meet/Calendar if you adopt Workspace later.
