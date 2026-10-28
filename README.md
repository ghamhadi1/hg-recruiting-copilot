# HG- AI Recruiting Copilot

A recruiter pastes a client call transcript, and the copilot writes the job description and posts it to Slack for approval.
Every CV (PDF, Word or scanned) becomes searchable. Recruiters ask in plain English in Slack (`/find who has 3+ years of GHL and speaks Arabic?`)
and get the **top 5 candidates**, each with a **score**, a **2-line reason** and the **CV file it came from**. One click on **Approve** puts the
candidate in the GoHighLevel pipeline and starts an email sequence that **stops by itself when they reply**.
Nothing reaches a candidate or client until a recruiter clicks Approve.

> **New here? Read [START_HERE.md](START_HERE.md)** (setup + how to test). The full "what and why" is in [EXPLANATION.md](EXPLANATION.md).

## How it works

```
Client call transcript ──► n8n 01 ──► OpenAI writes JD ──► Slack: [Approve] [Request changes] [Reject]
                                                                  │ Approve
                                                                  ▼
                                    JD emailed to client  +  auto-shortlist (n8n 03) posted to Slack
CV files ──► n8n 02: text / OCR ──► OpenAI profile ──► embeddings ──► Supabase (dedup + newer CV replaces older)
                     │ unreadable → flagged in Slack + portal (never skipped)
Slack /find ──► n8n 04 ──► n8n 03 search: parse question → hybrid search → AI scores → code guard → top 5
                                                                  │ [Approve for outreach]
                                                                  ▼
             n8n 05 ──► GHL contact + opportunity (stage Approved) ──► n8n 06 sequencer: email 1, follow-up day 3, day 7
             n8n 07 watches the Gmail thread ──► reply → sequence stops, GHL stage → Replied, Slack notified
Portal (Vercel): roles + shortlists · pipeline per stage · CV health · 10-question test with score · activity log
```

## What's in the repo

| Path | What |
|---|---|
| `n8n/workflows/*.json` | The 9 exported n8n workflows (templates with placeholders) |
| `n8n/src/` | Readable source the workflows are built from: `build_workflows.py` + one `.js` file per Code node |
| `supabase/schema.sql` | Tables, search function, dedup/replace logic, approval locks. Run once in Supabase |
| `portal/` | Recruiter portal: static pages + Vercel serverless API (keys stay server-side) |
| `slack/manifest.template.yml` | Slack app definition (commands, buttons, scopes) |
| `data/` | 5 fake call transcripts, 60 fake CVs (PDF/Word/scan), broken test files, generator scripts, ground truth |
| `eval/questions.json` | The 10 test questions and their right answers |
| `scripts/setup.py` | One script to check connections, write settings, import workflows and bulk-upload CVs |
| `tests/` | Offline tests for the logic (21 code-node tests, portal security, workflow lint) |

## Decisions (one line each)

**Stack**
- **OpenAI `gpt-4.1-mini`**: you already had a key. It's cheap and fast, supports strict JSON output, and reads scanned PDFs directly (no separate OCR service).
- **`text-embedding-3-small`**: good-quality search at almost no cost, with 1536-dim vectors that pgvector stores natively.
- **Supabase (Postgres + pgvector)**: one database does SQL filters, vector search and atomic logic (dedup, locks), and you already had an account.
- **Business rules live in SQL functions**: dedup, "newer CV wins", approval locks and stopping outreach are atomic, so double clicks or parallel runs can't break them.
- **n8n calls everything over HTTP Request nodes**: exact control over every API call, the workflows export cleanly, and there's no dependency on community nodes.
- **Gmail through n8n, sent via the Gmail API**: follow-ups stay in the same thread (proper In-Reply-To headers), and reply detection reads that thread.
- **Portal is plain HTML + Vercel functions (no framework)**: there's no build step to break, it loads fast, and secrets never reach the browser.

**Job description format**
- **Fields**: title, public client one-liner (no company name), about, must-haves, nice-to-haves, responsibilities, languages, hours, pay, start date, reports to, interview process.
- **`internal_notes` field** for things like "don't tell them we can pay more". It's shown to recruiters only and never in the client/candidate JD.
- **`open_questions` field** lists what the transcript didn't say, so the recruiter confirms it with the client instead of the AI guessing.
- **`search_query` generated with the JD** means approving a JD immediately builds its shortlist.
- **Request changes** opens a Slack form. The AI rewrites the JD with the feedback (v2, v3…) and it goes back for approval.

**Search and scoring**
- **Hybrid retrieval**: keyword hits on skills/languages plus vector similarity, so exact tools (QBO, n8n) and fuzzy phrasing both work.
- **Rubric (0–100)**: must-haves 50 · years of experience 20 · nice-to-haves 15 · language/location 15.
- **Pass mark 60**: below 60 is never recommended. The bot says "No good match" and names the closest people with their gaps.
- **Code guard after the AI**: unknown candidate IDs are dropped (no invented people), and duplicates are removed.
- **Hard checks**: a required language (not "basic"), a required skill, or the minimum years missing means the score is capped at 59.
- **Evidence check**: each reason must quote that person's CV, and a quote not found in the CV caps the score.
- **Every result carries its CV file name** in Slack, the portal and the database.

**CVs**
- **Text first, OCR fallback**: PDFs with no text layer go to the OpenAI vision model. If it's still unreadable, the CV is flagged in Slack and the portal with the reason.
- **Same person** = same email, else same phone (last 9 digits), else same normalised name.
- **Newer CV wins**: it uses the "last updated" date in the CV, or the most recent job date. The old CV is kept for history but removed from search.
- **Identical file** (same text hash) is stored once and logged as a duplicate.

**Pipeline and outreach**
- **GHL pipeline `HG- Candidates`**: Approved → Outreach Sent → Replied → Screening Call → Submitted to Client → Placed / Not a Fit.
- **The copilot moves cards up to "Replied"**. People make the later moves in GHL, since those are human decisions.
- **3-email sequence** (day 0, +3, +7): short, personal (uses the AI's reason line), easy to answer with yes/no.
- **Test mode is on by default**: every email goes to your own inbox as `you+hg-c<ID>@gmail.com`, per the sandbox rules.
- **Approval gate is checked again right before every send** (role approved + candidate approved + sequence still active).
- **Everything is prefixed `HG-`**: workflows, credentials, GHL contacts/opportunities/tags, webhook paths (`hg-p3-*`).

**Security**
- **Keys live only in n8n credentials, Vercel env vars and your local `.env`** (git-ignored). None are in the repo, the browser or the workflow JSON.
- **Every webhook needs a secret header**. Slack requests are checked against the Slack verification token.
- **Supabase RLS is on with no policies**, so only the service key (server-side) can read data.
- **The portal has a password login** with an HttpOnly signed cookie, and all data goes through server functions.
