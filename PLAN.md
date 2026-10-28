# HG- Project 3: AI Recruiting Copilot (Plan)

> Status: **APPROVED 2026-10-25** with one change: **OpenAI instead of Gemini** (`gpt-4.1-mini` for text + reading scanned PDFs, `text-embedding-3-small` for search).
> Build note: this PC has no Node.js/Git, so the portal is plain HTML + Vercel serverless functions (no build step, no npm packages), which is less that can break.

---

## 1. What we're building (one paragraph)

A recruiter pastes or uploads a client call transcript. The copilot writes a job description and posts it to Slack with **Approve / Edit / Reject** buttons. Every CV (PDF, Word, or scanned) gets read, deduplicated, and turned into something searchable. The recruiter asks in Slack in plain English, for example *"who has 3+ years of GHL and speaks Arabic?"*, and gets the **top 5 candidates**. Each one comes with a score, a 2-line reason, and the CV file it came from. The recruiter clicks **Approve** on a candidate, who then goes into a GHL pipeline and gets an outreach email sequence that **stops when they reply**. A web portal shows the open roles with their shortlists, the candidates in each pipeline stage, and a 10-question accuracy test.

---

## 2. Stack (and why)

| Piece | Choice | Why |
|---|---|---|
| Automation | **n8n** (n8ndemo.remotelyx.com) | Required by the brief, and the workflows export as JSON |
| AI | **Gemini 2.5 Flash** (free tier) for JD writing, CV parsing, ranking, and OCR of scanned CVs. **Gemini embeddings** for search | Free, reads images (needed for the scanned CV), and one key covers everything |
| Database | **Supabase** (Postgres + pgvector), free tier | SQL filters ("3+ years") and vector search in one place, and the portal can read it easily |
| Chat | **Slack** free workspace with a custom bot (buttons + `/find` and `/jd` commands) | The recruiter works in Slack, and buttons give one-click approval |
| CRM | **GoHighLevel** sandbox: contacts + an `HG- Candidates` pipeline | Required. Every record gets the `HG-` prefix |
| Email | **Gmail through n8n** | Free. Reply detection works on the same Gmail thread |
| Portal | **Next.js on Vercel** (free), code on GitHub | Server-side API routes keep every key off the browser |
| Test data | Python scripts (reportlab, python-docx, Pillow) | Reproducible fake data with deliberate messiness |

---

## 3. Fake data I'll generate (`/data`)

**5 client call transcripts** (messy, conversational, with "ums", contradictions, and vague asks):
1. GHL Automation Specialist (US marketing agency): needs GHL, Zapier/n8n, **Arabic a plus**
2. Bilingual Executive Virtual Assistant (Arabic/English)
3. Full-Stack Developer (React + Node)
4. Remote Bookkeeper (QuickBooks, US clients)
5. SDR / Appointment Setter (cold calling, CRM)

**60 CVs** spread across those roles, about 50/50 PDF and Word, with varied layouts:
- **1 scanned image-only CV** (a PDF that contains only a photo of a page, so there's no text layer)
- **3 people who appear twice** (same person, different filename/format: e.g. `Omar_Haddad.pdf` + `omar haddad cv final.docx`)
- **2 people with an updated CV** (newer date, extra job/skill). The new one must **replace** the old one
- A few near-misses on purpose (2.5 years instead of 3, French instead of Arabic) so we can test the "no good match" case
- All names, emails, and phones are fake. Outreach test emails go **only to your own Gmail** (using `+alias` addresses)

---

## 4. Database design (Supabase)

- `candidates`: one row per real person (name, email, phone, languages, location, skills with years, `current_cv_id`)
- `cvs`: every file received (filename, hash, upload date, status: `active` / `superseded` / `duplicate` / `unreadable`, raw text)
- `cv_chunks`: text chunks + embeddings, for **active** CVs only
- `roles`: job descriptions (status: `draft` → `pending_approval` → `approved` / `rejected`)
- `shortlists`: role ↔ candidate, score, 2-line reason, source CV, status (`suggested` / `approved` / `rejected`)
- `outreach`: sequence step, next send date, `stopped_reason` (replied / manual)
- `eval_runs`: results of the 10-question test

**Dedup rules:**
- Same file hash means an exact duplicate. It's logged and ignored.
- Same person means same email, or else same phone, or else same name with a fuzzy match.
- When it's the same person with a different CV, the newer one wins (by the date on the CV, otherwise the upload date). The old CV gets marked `superseded` and its chunks are deleted, so it never shows up in search again.

---

## 5. n8n workflows (all prefixed `HG-`, exported to `/n8n`)

| # | Workflow | What it does |
|---|---|---|
| 1 | **HG- Transcript → JD** | Takes a transcript (portal upload or `/jd` in Slack). Gemini writes a structured JD (format below), saves it as `pending_approval`, and posts to Slack with Approve / Request changes / Reject |
| 2 | **HG- CV Ingest** | Gets a file, extracts text (PDF/DOCX). If there's little or no text, it runs Gemini Vision OCR. If it's still unreadable, it's **flagged** in the DB and alerted in Slack (never skipped). Then Gemini pulls out a structured profile, dedup/replace runs, and the CV is chunked and embedded |
| 3 | **HG- Candidate Search** | `/find <question>` → Gemini turns the question into hard filters (skill, min years, language) + a meaning query → SQL filter + vector search → Gemini scores only the retrieved candidates → a **guard step drops any candidate not in the DB** → top 5 with score, 2-line reason, and CV filename. If nobody scores ≥ 60, it replies: *"No strong match. Closest was X (score 48) because…"* |
| 4 | **HG- Slack Actions** | One endpoint for every button click: approve/reject JD, approve/reject candidate |
| 5 | **HG- Approve → GHL** | Upserts the GHL contact (tag `HG-candidate`) and creates an opportunity in `HG- Candidates` at stage *Approved*. Then it starts the outreach sequence |
| 6 | **HG- Outreach Sequencer** | Runs every 15 min. Sends email 1 (day 0), follow-up 2 (day 3), and follow-up 3 (day 7) via Gmail. **Before each send it checks for a reply.** If there's a reply, it stops and moves the GHL stage to *Replied* |
| 7 | **HG- Reply Watcher** | Gmail trigger. A reply from a candidate stops their sequence right away and updates GHL + Slack |
| 8 | **HG- Eval Runner** | Runs the 10 test questions, compares results with the expected answers, and saves a score out of 10 for the portal |

**Approval gate:** nothing is sent to a candidate or client unless the matching DB row is `approved`, and only the Slack button sets that. The sequencer re-checks this before every send.

---

## 6. My calls (the decisions left to me)

- **JD format:** Title · Client summary (anonymised) · About the role · Must-haves · Nice-to-haves · Responsibilities · Hours / timezone · Rate band · Languages. Must-haves are stored as structured data so search can reuse them.
- **Pipeline stages:** Approved → Outreach Sent → Replied → Screening Call → Submitted to Client → Placed / Not a Fit.
- **Scoring (0–100):** Must-haves 50 · Years of experience 20 · Nice-to-haves 15 · Language/timezone 15. A candidate who fails a hard filter can't score above 59. The "good match" cutoff is 60.
- **Grounding:** every reason has to quote evidence from the CV text. The output gets validated, so a candidate ID or filename that isn't in the DB gets rejected.

---

## 7. Recruiter portal (Next.js, Vercel)

Simple password login (stored in a Vercel env var).
- **Roles:** open roles with JD and status, plus their shortlist (score, reason, CV link)
- **Pipeline:** kanban of candidates per GHL stage (read live from GHL on the server side)
- **CV Health:** flagged/unreadable CVs, duplicates, superseded CVs
- **Test:** the 10 questions, expected answers, the bot's answers, score /10, and a "Run test again" button
- **Upload:** drop a transcript or CVs (sent to n8n webhooks)

**Security:** all keys live in **n8n credentials** and **Vercel environment variables**. Never in the repo, the browser, or screenshots. A local `.env` is git-ignored.

---

## 8. Hard cases I'll test on purpose

1. Scanned CV gets OCR'd and found in search (or flagged if OCR fails)
2. Duplicate person appears **once** in results
3. Updated CV shows the **new** info; the old CV is never cited
4. Impossible question ("10 years of GHL + speaks Japanese") gets "no good match", not invented people
5. Approve clicked twice doesn't create a double GHL contact or a double email
6. Candidate replies, the sequence stops, and GHL moves to *Replied*
7. JD rejected means nothing goes to the client
8. Corrupt/empty file gets flagged in Slack + portal

---

## 9. Deliverables (folder layout)

```
/data          fake transcripts + 60 CVs + generator scripts
/n8n           exported workflow JSONs
/supabase      schema.sql
/portal        Next.js app (→ GitHub + Vercel)
/eval          10 questions + expected answers
START_HERE.md  step-by-step setup + how to test (written for non-technical readers)
EXPLANATION.md everything I did and why
README.md      how it works + one line per decision
```

---

## 10. What I can't do from here (you'll do these by hand, with step-by-step guides from me)

- Create the **Slack app** and install it (I'll give you a ready-made manifest to paste)
- Create the **GHL pipeline** (the GHL API can't create pipelines) and paste in the IDs
- Create the **Supabase**, **Vercel**, and **GitHub** accounts/projects, and connect Gmail OAuth in n8n
- Import the workflows into n8n (or give me an n8n API key and I'll push them)
- Record the Loom

**Where your GHL Location ID and API key go:** in **n8n → Credentials** (a "Header Auth" credential named `HG- GHL`) and in **Vercel → Environment Variables** (`GHL_API_KEY`, `GHL_LOCATION_ID`). Not in any file I write.

---

## 11. Questions before I start

1. **AI provider:** OK with Gemini (free)? Or do you prefer Claude/OpenAI?
2. **Roles:** are the 5 roles above fine?
3. **Outreach:** OK to send from n8n + Gmail (exportable, reply-stop logic I control)? The alternative is a GHL Workflow built by hand in the GHL UI.
4. Do you already have Supabase / Vercel / GitHub accounts?

**Reply "approved" (plus any changes) and I'll build it.**
