## Practice Projects: Read This First
These rules apply to every project in this channel.

**Do projects in number order, solo.** Ask and submit in each project's thread.

**Every submission includes:**
- Live link(s) to what you built
- README: how it works + every decision you made and why (one line each)
- Loom (max 3 min, in English) showing it working, including the hard cases

**Graded on:** it works end to end, it survives the hard cases, your decisions are justified, and a non-technical person can use it without you there.

**Tools:** any tool, model, database or hosting is fine unless the brief says otherwise.

**Access:**
- GHL sandbox: Location ID `TELL ME WHERE TO ADD IT` · API key `TELL ME WHERE TO ADD IT`
- n8n: your account on n8ndemo.remotelyx.com
- AI: your own key (Gemini, Claude or OpenAI)

**Shared sandbox rules:**
- Prefix everything you create with initials 'HG-'
- Never edit or delete anything that isn't yours
- While testing, only message yourself (your own email/phone)

**Security:** keys NEVER go in browser code, screenshots, Looms or public repos. A live link that exposes a key fails.

Please use made-up data only, not real people's details.

**💸 Cost:** everything can be free except Claude Code.
- n8n + GHL: demo accounts provided
- Claude Code: needs a paid Claude plan (Pro)
- AI inside n8n: Gemini API free tier (chat, embeddings, scanned files) or OpenRouter. Claude/OpenAI APIs are pay-as-you-go.
- Hosting: Vercel, Netlify or Cloudflare free tiers
- Database: Supabase or Neon free tier (or any other database platform)
- Booking: GHL calendar, Cal.com or Calendly
- Email: Gmail through n8n
- Slack, GitHub, Google Sheets, Loom: free

## what I need from Claude
- create a file, and tell me what are you planning to do in this project, wait my approve to continue doing the project fully
- If you have any issues while doing the project, skip it and tell me how to do it manually, and create a file START_HERE in details how to use and how test the project
- create a file EXPLANATION to explain fully what you did and why you did


## 🧠 Project 3: AI Recruiting Copilot
*n8n + GoHighLevel + Claude Code + Slack*

**Background:** A remote-staffing agency fills roles for US clients. Recruiters spend hours turning client call notes into job descriptions and reading CVs by hand. Build the copilot that writes the job description, picks the best 5 candidates with reasons, and runs outreach, with a recruiter approving every step.

**Deliver:**
- n8n workflows (exported JSON)
- Slack bot in your own free Slack workspace
- Recruiter portal built with Claude Code, hosted online: live link + repo
- Loom: one role from call notes → shortlist → outreach

**Data:** make it yourself with AI: 5 fake client call transcripts and 60 fake CVs (PDF and Word) across those roles. Make it messy on purpose: 1 scanned image-only CV, 3 people who appear twice, 2 people with an updated CV.

**Must handle:**
- Call transcript → job description, sent to Slack for approval
- Every CV becomes searchable. An updated CV replaces the old one.
- Plain-English questions ("who has 3+ years of GHL and speaks Arabic?") → top 5 candidates, each with a score and a 2-line reason
- Approved candidates go into a GHL candidate pipeline and get an outreach email sequence that stops when they reply

**The real work:**
- Nothing reaches a candidate or client until a recruiter clicks Approve.
- No good match? The bot says so. It never invents a candidate.
- Every recommendation names the CV it came from.
- Unreadable CVs are flagged, never silently skipped.

**Portal must show:** open roles with their shortlists, candidates per pipeline stage, and a test page: 10 questions you wrote, the right answers, and your bot's score out of 10.

**Your call:** job description format, pipeline stages, scoring method, database, portal design.

**Audience:** A non-technical recruiter: ask in Slack, trust the answer, approve in one click.