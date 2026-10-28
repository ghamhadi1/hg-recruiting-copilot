# START HERE: finish, use and test the HG- AI Recruiting Copilot

This guide takes you from "files on my computer" to "working project I can submit". Do the steps **in order** and tick each box.
Every step says **what to click**, **what to copy where**, and **what you should see**. If you don't see it, go to the Troubleshooting part at the end.

**Total time:** about 2 hours (most of it is creating accounts and clicking through settings).

**The big picture of what you'll do:**

| Phase | What | Time |
|---|---|---|
| 1 | Prepare your private settings file (`.env`) | 5 min |
| 2 | Supabase: create the database | 10 min |
| 3 | OpenAI: get a key | 5 min |
| 4 | GoHighLevel: create the candidate pipeline | 10 min |
| 5 | n8n: API key + Gmail connection | 25 min |
| 6 | Slack: create the bot | 15 min |
| 7 | Run the setup script (it does the rest of the wiring) | 5 min |
| 8 | Load the 60 CVs | 15 min (mostly waiting) |
| 9 | Put the code on GitHub | 10 min |
| 10 | Put the portal online (Vercel) | 10 min |
| 11 | Test everything (checklist) | 30 min |
| 12 | Record the Loom and submit | 20 min |

---

## Before you start: what I could NOT do for you (and why)

| Manual step | Why I couldn't do it |
|---|---|
| Create accounts and copy keys | They need your logins |
| Run the database script in Supabase | Needs your Supabase login |
| Create the GHL pipeline | The GHL API cannot create pipelines |
| Create and install the Slack app | Slack requires a person to click "Install" |
| Connect Gmail in n8n | Google requires a person to sign in |
| GitHub + Vercel | This PC has no Git/Node, and both need your login |
| Loom | Needs you |

Everything else (data, workflows, database logic, portal, setup script, docs) is already built and tested offline.

---

## Phase 1: Prepare your private settings file (`.env`)

The file `.env` holds all your keys. It stays **only on your computer**. It is never uploaded, never shown in a Loom.

- [ ] **1.1** Open the project folder in File Explorer.
- [ ] **1.2** Turn on file extensions so you can see them: File Explorer → **View** → tick **File name extensions**.
- [ ] **1.3** Copy `.env.example` and paste it in the same folder. Rename the copy to exactly **`.env`** (no `.txt`, no "copy"). If Windows warns about changing the extension, click **Yes**.
- [ ] **1.4** Right-click `.env` → **Open with → Notepad**. Keep it open; you'll fill it in during the next phases.
- [ ] **1.5** Fill in these two lines right away:
  ```
  TEST_RECIPIENT=your.own.address@gmail.com      ← your own Gmail. In test mode ALL emails go here
  PORTAL_PASSWORD=choose-a-password              ← the password recruiters use to open the portal
  ```
- [ ] **1.6** Leave `N8N_BASE_URL=https://n8ndemo.remotelyx.com` and `WEBHOOK_PATH_PREFIX=hg-p3` as they are.
- [ ] **1.7** Save (Ctrl+S). When saving, make sure the name stays `.env`. If Notepad offers "Save as type", choose **All files**.

**How to open PowerShell in the project folder** (you'll need this later): click the File Explorer address bar, type `powershell`, press Enter. A blue/black window opens already "inside" the project folder.

---

## Phase 2: Supabase (the database)

- [ ] **2.1** Go to **supabase.com** → log in → **New project**.
  - Name: `HG-recruiting-copilot` · Database password: anything (save it somewhere) · Region: closest to you → **Create new project**. Wait ~2 minutes until it's ready.
- [ ] **2.2** Left menu → **SQL Editor** → **+ New query**.
- [ ] **2.3** On your computer, open `supabase\schema.sql` with Notepad → **Ctrl+A**, **Ctrl+C**.
- [ ] **2.4** Paste it into the Supabase SQL editor → click **Run** (bottom right).
  - ✅ **You should see:** "Success. No rows returned".
  - ❌ If you see an error about "extension vector", go to **Database → Extensions**, enable **vector** and **pg_trgm**, and run the script again (it's safe to run twice).
- [ ] **2.5** Left menu → **Table Editor**. ✅ You should see tables starting with `hg_` (hg_candidates, hg_cvs, hg_roles…).
- [ ] **2.6** Get the URL: **Project Settings** (gear icon) → **Data API** (or **API**) → copy **Project URL** → in `.env`:
  ```
  SUPABASE_URL=https://abcdefgh.supabase.co
  ```
- [ ] **2.7** Get the secret key: **Project Settings → API Keys**.
  - If there is a tab **"Legacy API keys"**, open it and copy the **service_role** key (long, starts with `eyJ`). Click "Reveal" first.
  - If there is no legacy tab, copy the **Secret key** (starts with `sb_secret_`).
  - Paste into `.env`: `SUPABASE_SERVICE_KEY=...`
  - ⚠️ Do NOT use the `anon` / `publishable` key: the copilot would see an empty database.
- [ ] **2.8** Save `.env`.

---

## Phase 3: OpenAI

- [ ] **3.1** Go to **platform.openai.com** → log in → **Settings → Billing** → check you have some credit ($5 is far more than enough; the whole project uses about $1).
- [ ] **3.2** **API keys** (left menu, or Dashboard → API keys) → **+ Create new secret key** → name `HG-copilot` → **Create** → copy the key (starts with `sk-`).
- [ ] **3.3** In `.env`: `OPENAI_API_KEY=sk-...` and keep `OPENAI_MODEL=gpt-4.1-mini`. Save.

---

## Phase 4: GoHighLevel (candidate pipeline)

- [ ] **4.1** In `.env`, paste the sandbox details from the brief:
  ```
  GHL_LOCATION_ID=<Location ID from the brief>
  GHL_API_KEY=<API key from the brief>
  ```
  > This is the answer to "TELL ME WHERE TO ADD IT": these two values go **here, in `.env`**. The setup script copies the key into a protected n8n credential, and you'll paste it into Vercel's protected settings. They never go into code, screenshots or the Loom.
- [ ] **4.2** Log into the GHL sandbox → open the sandbox location → **Opportunities** → **Pipelines** tab (in some versions: **Settings → Pipelines**) → **+ Create new pipeline**.
- [ ] **4.3** Pipeline name, exactly: **`HG- Candidates`** (capital H, G, dash, space, capital C).
- [ ] **4.4** Add these 7 stages **in this order, spelled exactly like this**:
  1. `Approved`
  2. `Outreach Sent`
  3. `Replied`
  4. `Screening Call`
  5. `Submitted to Client`
  6. `Placed`
  7. `Not a Fit`
- [ ] **4.5** Save. ✅ You should see the pipeline in the Opportunities pipeline dropdown.
  (You don't need to copy any IDs. The setup script finds the pipeline and stages by name.)

---

## Phase 5: n8n (API key + Gmail)

### 5A. n8n API key (lets the setup script import the 9 workflows for you)
- [ ] **5.1** Log into **n8ndemo.remotelyx.com** with your account.
- [ ] **5.2** Bottom-left: your name / **Settings** → **n8n API** → **Create an API key** → label `HG-setup` → copy it.
- [ ] **5.3** In `.env`: `N8N_API_KEY=...` and save.
  - If you don't see "n8n API" in Settings (it may be disabled on the demo server), leave it empty. You'll import the files by hand in Phase 7B.

### 5B. Gmail connection (so the copilot can send outreach from your Gmail)
This is the longest step. You only do it once.

- [ ] **5.4** Go to **console.cloud.google.com** (with the same Google account as your Gmail) → top bar project picker → **New project** → name `HG Copilot` → **Create** → make sure it is selected.
- [ ] **5.5** Search bar → **Gmail API** → click it → **Enable**.
- [ ] **5.6** Left menu → **Google Auth Platform** (older screens: **APIs & Services → OAuth consent screen**) → **Get started**:
  - App name `HG Copilot`, support email = your Gmail → Next
  - Audience: **External** → Next
  - Contact email = your Gmail → Next → agree → **Create**
- [ ] **5.7** **Audience** (or "Test users") → **+ Add users** → add **your own Gmail** → Save.
- [ ] **5.8** Now in **n8n**: left menu → **Credentials** (or Overview → Credentials) → **Add credential** (or Create → Credential) → search **Gmail OAuth2 API** → Continue.
  - At the very top, rename the credential to exactly **`HG- Gmail`**.
  - Copy the **OAuth Redirect URL** shown (looks like `https://n8ndemo.remotelyx.com/rest/oauth2-credential/callback`).
- [ ] **5.9** Back in Google: **Clients** (older: **Credentials → + Create credentials → OAuth client ID**) → **Create client**:
  - Application type: **Web application** · Name: `n8n`
  - **Authorized redirect URIs → + Add URI** → paste the n8n redirect URL → **Create**.
  - Copy the **Client ID** and **Client secret**.
- [ ] **5.10** Back in n8n: paste Client ID and Client Secret → click **Sign in with Google** → choose your Gmail.
  - You will see "Google hasn't verified this app": click **Continue** (it's your own app). Allow all permissions.
  - ✅ n8n shows "Account connected". Click **Save**.
- [ ] **5.11** Get the credential's ID: with the credential open, look at the browser address bar. It ends with `/credentials/XXXXXXXX`. Copy that last part.
  In `.env`: `N8N_CRED_GMAIL=XXXXXXXX` → save.

---

## Phase 6: Slack (the bot recruiters talk to)

- [ ] **6.1** Create a free workspace: **slack.com → Create a new workspace** → use your email → name it e.g. `HG Recruiting Demo`.
- [ ] **6.2** In the workspace, create a channel: **+ Add channels → Create a new channel** → name `hg-recruiting`.
- [ ] **6.3** On your computer, open PowerShell in the project folder (see Phase 1) and run:
  ```
  python scripts\setup.py slack
  ```
  ✅ You should see: `slack/manifest.ready.yml written`.
- [ ] **6.4** Go to **api.slack.com/apps** → **Create New App** → **From a manifest** → pick your workspace → **Next** → select the **YAML** tab → delete what's there → open `slack\manifest.ready.yml` in Notepad, copy everything, paste → **Next** → **Create**.
- [ ] **6.5** On the app page: **Install App** (left menu) → **Install to `HG Recruiting Demo`** → **Allow**.
- [ ] **6.6** **OAuth & Permissions** (left menu) → copy **Bot User OAuth Token** (starts with `xoxb-`) → `.env`: `SLACK_BOT_TOKEN=xoxb-...`
- [ ] **6.7** **Basic Information** → scroll to **App Credentials** → **Verification Token** → Show → copy → `.env`: `SLACK_VERIFICATION_TOKEN=...`
- [ ] **6.8** In Slack, open **#hg-recruiting** → click the channel name at the top → scroll to the bottom of the pop-up → copy **Channel ID** (starts with `C`) → `.env`: `SLACK_CHANNEL_ID=C...`
- [ ] **6.9** In the channel, type `/invite @HG Recruiting Copilot` and press Enter. ✅ "HG Recruiting Copilot joined".
- [ ] **6.10** Save `.env`.

---

## Phase 7: Run the setup script

### 7A. Automatic (you have an n8n API key)
In PowerShell in the project folder:

- [ ] **7.1** `python scripts\setup.py check`
  ✅ You want ✅ on: Supabase, OpenAI model, Slack bot token, GHL (+ pipeline exists), n8n API, TEST_RECIPIENT.
  ❌ Fix any ❌ using the message shown (usually a wrong or incomplete key in `.env`), then run it again.
- [ ] **7.2** `python scripts\setup.py all`
  This:
  - writes your settings and the 10 test questions into Supabase
  - creates 5 n8n credentials: `HG- Supabase`, `HG- OpenAI`, `HG- Slack Bot`, `HG- GHL`, `HG- Webhook Secret`
  - imports the 9 workflows and switches them **on**
  - generates a random `WEBHOOK_SECRET` and saves it in `.env`

  ✅ You should see `HG- 00 … imported and ACTIVE` through `HG- 08 … imported and ACTIVE`.
- [ ] **7.3** Check in n8n: **Workflows**. ✅ 9 workflows named `HG- 00` … `HG- 08`, each with the **Active** toggle on.

### 7B. Manual (only if you have NO n8n API key)
- [ ] **7.4** Run `python scripts\setup.py supabase` (writes settings and questions).
- [ ] **7.5** In n8n → **Credentials**, create these 5 (names exactly as written):

  | Name | Credential type | What to fill in |
  |---|---|---|
  | `HG- Supabase` | Supabase API | Host = your `SUPABASE_URL`; Service Role Secret = your `SUPABASE_SERVICE_KEY` |
  | `HG- OpenAI` | OpenAI API | API Key = your `OPENAI_API_KEY` |
  | `HG- Slack Bot` | Slack API | Access Token = your `xoxb-` token |
  | `HG- GHL` | Header Auth | Name = `Authorization`; Value = `Bearer ` + your GHL API key (with the space) |
  | `HG- Webhook Secret` | Header Auth | Name = `X-HG-Secret`; Value = the `WEBHOOK_SECRET` from `.env` (run `python scripts\setup.py slack` once if it's empty; that fills it in) |

- [ ] **7.6** Copy each credential's ID (end of the URL) into `.env`: `N8N_CRED_SUPABASE`, `N8N_CRED_OPENAI`, `N8N_CRED_SLACK`, `N8N_CRED_GHL`, `N8N_CRED_WEBHOOK`. Save.
- [ ] **7.7** Run `python scripts\setup.py n8n`. It creates the folder `n8n\ready\` with 9 files already linked to your credentials.
- [ ] **7.8** In n8n: **Workflows → Create → Import from File** (or ⋯ menu → Import from File) → import `n8n\ready\HG-00_Error_Alerts.json` → **Save**. Repeat for HG-01 … HG-08.
- [ ] **7.9** Open each of HG-01 … HG-08 → ⋯ → **Settings** → **Error workflow** = `HG- 00 Error Alerts` → Save.
- [ ] **7.10** Switch every workflow **Active** (toggle at the top right).
  If a node shows a red ⚠️, open it and pick the matching `HG-` credential from the dropdown.

### 7C. Quick live check (both paths)
- [ ] **7.11** In Slack #hg-recruiting type: `/find help`
  ✅ The bot answers with usage instructions (only you see it).
  ❌ "dispatch_failed" → HG-04 is not active, or the URL in the Slack app is wrong (see Troubleshooting).

---

## Phase 8: Load the 60 CVs

- [ ] **8.1** In PowerShell: `python scripts\setup.py upload-cvs --hard`
  It sends the 60 CVs in random order (like real life), plus 2 broken test files. Each CV is read by AI, so this takes **10–15 minutes**. Leave the window open.
- [ ] **8.2** ✅ At the end you should see a summary close to:
  - `new: 55`: 55 unique people
  - `duplicate_person: 2` and `duplicate_file: 1`: Omar, Bilal and Rania sent their CV twice
  - `replaced` / `older_ignored`: 2 in total (Lina and Layla have a newer CV; the newer one always wins whatever the order)
  - `unreadable: 2`: `corrupt_cv.pdf`, `blank_scan.pdf`
  - `Scan_0007.pdf → new … (OCR)`: the scanned CV was read by the vision model
- [ ] **8.3** In Slack you'll see ⚠️ "Unreadable CV flagged" twice and 🔁 "Updated CV" once or twice. ✅ That's expected.

---

## Phase 9: Put the code on GitHub

**Recommended: GitHub Desktop.** It automatically skips `.env` thanks to the `.gitignore` file.

- [ ] **9.1** Create a GitHub account if needed (github.com).
- [ ] **9.2** Install **GitHub Desktop** (desktop.github.com) → sign in.
- [ ] **9.3** **File → Add local repository** → choose the project folder → it says "not a Git repository" → click **create a repository** → Name `hg-recruiting-copilot` → **Create repository**.
- [ ] **9.4** ⚠️ **Safety check:** in the "Changes" list on the left, make sure **`.env` is NOT listed**. (`.env.example` is fine; it has no keys.) If `.env` appears, stop and tell me.
- [ ] **9.5** Bottom left: Summary `First version` → **Commit to main** → **Publish repository**.
  - Untick "Keep this code private" if your grader needs to see it. That's safe because there are no keys in the code. Or keep it private and invite the grader in GitHub → Settings → Collaborators.
- [ ] **9.6** ✅ Open github.com/<you>/hg-recruiting-copilot. You see folders `data`, `n8n`, `portal`, `supabase`… and **no `.env`**.

*(Alternative without GitHub Desktop: create the repo on github.com → "uploading an existing file" → drag the folders in. The web upload accepts max 100 files at a time, so upload `data` separately. **Never drag `.env`.**)*

---

## Phase 10: Put the portal online (Vercel)

- [ ] **10.1** Go to **vercel.com** → **Sign up / Log in with GitHub**.
- [ ] **10.2** **Add New… → Project** → find `hg-recruiting-copilot` → **Import**.
- [ ] **10.3** In the configuration screen:
  - **Root Directory** → **Edit** → select **`portal`** → Continue
  - **Framework Preset**: **Other**
  - Leave Build/Output settings empty (the `vercel.json` file handles it)
- [ ] **10.4** Open **Environment Variables** and add these 8 (Name → Value, click **Add** after each). Copy the values from your `.env`:

  | Name | Value |
  |---|---|
  | `PORTAL_PASSWORD` | your portal password from `.env` |
  | `SESSION_SECRET` | any long random text, e.g. 40 random letters/numbers |
  | `SUPABASE_URL` | from `.env` |
  | `SUPABASE_SERVICE_KEY` | from `.env` |
  | `N8N_BASE_URL` | `https://n8ndemo.remotelyx.com` |
  | `WEBHOOK_PATH_PREFIX` | `hg-p3` |
  | `WEBHOOK_SECRET` | from `.env` (the script filled it in Phase 7) |
  | `GHL_API_KEY` | from `.env` |

- [ ] **10.5** **Deploy**. Wait ~30 seconds. ✅ "Congratulations!" → click the preview → you get a link like `https://hg-recruiting-copilot.vercel.app`.
- [ ] **10.6** Open the link → login page → enter your `PORTAL_PASSWORD`. ✅ You see the **Roles** page (empty for now) and the menu Roles · Pipeline · CVs · Test · Activity.
- [ ] **10.7** Click **CVs**. ✅ 55 people, 2 unreadable in a red box, `Scan_0007.pdf` "OCR (scan)".
- [ ] **10.8** Put the portal link in `.env`: `PORTAL_URL=https://hg-recruiting-copilot.vercel.app` (no slash at the end) → save → in PowerShell:
  ```
  python scripts\setup.py supabase
  ```
  Now Slack messages contain links to the portal.

  > If you ever change an Environment Variable in Vercel: **Deployments → ⋯ → Redeploy**, otherwise the change isn't used.

🎉 **The project is now fully set up.**

---

## Phase 11: Test everything (do this before recording the Loom)

Each test says what to do and what you should see. Tick when it works.

### Test 1: Call transcript → JD → Slack approval
- [ ] Portal → **Roles** → **+ New role from call transcript**.
- [ ] Client name `BrightPath Marketing`. Click **Choose File** → `data\transcripts\01_brightpath_ghl_specialist.txt` (or paste its text) → **Write job description**.
- [ ] ✅ Portal: "The JD is being written…". ✅ Within ~20 s, #hg-recruiting shows **📝 JD for approval: GHL Automation Specialist** with must-haves, nice-to-haves, hours and pay, plus 3 buttons.
- [ ] ✅ Check quality: must-haves include **3+ years GoHighLevel** and **Zapier or Make**. **Arabic** is a nice-to-have/preferred. The client's "maybe a bit more, don't tell them" is shown **only** under 🔒 Internal.
- [ ] Click **✏️ Request changes** → type `Make Arabic a must-have` → **Rewrite JD**.
  ✅ The old message changes to "changes requested…". ✅ A new message **version 2** appears with Arabic under must-haves.
- [ ] On version 2 click **✅ Approve**.
  ✅ Buttons disappear and "Approved by @you" shows. ✅ Your Gmail receives "Job description for your approval record…" (test mode: it goes to you, not the client). ✅ About 20 s later: **📋 Shortlist: GHL Automation Specialist** with candidates and **✅ Approve for outreach** buttons.
- [ ] Portal → Roles: ✅ the role shows **approved**. Click it: ✅ JD + shortlist with scores, 2-line reasons and 📄 CV file names.
- [ ] **Hard case (double click):** do the same with transcript `04_harbordental_bookkeeper.txt`, then click **❌ Reject** → ✅ "Rejected… Nothing was sent to the client", and no email arrives.

### Test 2: Plain-English questions → top 5 with score, 2 lines, CV file
- [ ] In Slack: `/find who has 3+ years of GHL and speaks Arabic?`
- [ ] ✅ "Searching…" then results: **Omar Haddad, Sara Nasser, Lina Khoury, Youssef El Amrani** (order may vary), each with **score /100**, **2 lines**, **📄 CV file**.
- [ ] ✅ **Sara Nasser's CV is `Scan_0007.pdf`**: the scanned CV was read and found.
- [ ] ✅ **Omar appears once** although he sent 2 CVs.
- [ ] ✅ **Lina's file is `Lina Khoury - Resume 2026.pdf`**, never the old `Lina_Khoury_CV.docx`.
- [ ] ✅ **Karim Mansour** (2.5 years), **Ahmed Fathy** (1 year) and **Daniel Brooks** (no Arabic) are NOT in the list.
- [ ] Try: `/find who knows n8n and speaks Arabic?` → ✅ Lina (new CV) + Youssef.
- [ ] Try: `/find bookkeeper with QuickBooks Online and Gusto payroll for US clients` → ✅ Joanne Cruz, Linh Nguyen, Mariam Khalil.

### Test 3: No good match, never invents anyone
- [ ] `/find who has 10+ years of Salesforce and speaks Japanese?`
- [ ] ✅ "🤷 **No good match**. Nobody scored 60+…" plus the closest person (Hana Suzuki) with her gap ("2 yrs Salesforce, needs 10+"). ✅ **No** approve buttons.
- [ ] `/find who has a nursing license?` → ✅ No good match.

### Test 4: Approve → GHL pipeline → outreach → stops on reply
- [ ] *(Optional, to see follow-ups fast)* Supabase → **Table Editor → hg_settings** → row `followup_delays_minutes` → change value to `[3, 3]` → Save. (Normal is `[4320, 5760]` = 3 days then 4 days.)
- [ ] In the **📋 Shortlist** message (from Test 1), click **✅ Approve for outreach** on one candidate, e.g. Omar.
- [ ] ✅ Slack: "✅ Omar Haddad approved for GHL Automation Specialist… added to pipeline HG- Candidates → Approved… email 1 goes out within a few minutes to `you+hg-c…@gmail.com`… 📄 Based on CV…".
- [ ] ✅ GHL → **Opportunities** → pipeline **HG- Candidates**: a card **"HG- Omar Haddad - GHL Automation Specialist"** in **Approved**.
- [ ] ✅ Within ~1–5 minutes your Gmail receives **email 1** ("GHL Automation Specialist role with a US client: quick question, Omar") with "Your background stood out: …" and a TEST MODE note. ✅ The GHL card moves to **Outreach Sent**.
- [ ] **Click Approve again** on the same candidate → ✅ "already approved: no second email will be sent" (only you see it). ✅ No second email arrives.
- [ ] If you set `[3, 3]`: wait ~5–8 minutes → ✅ **follow-up 2** arrives **in the same email thread**.
- [ ] Now **reply** to that email from your Gmail (write anything, e.g. "Interested!").
- [ ] ✅ Within ~2 minutes Slack posts: "📬 **Omar Haddad replied** about GHL Automation Specialist. Outreach stopped after N email(s). GHL stage → Replied".
- [ ] ✅ GHL card is now in **Replied**. ✅ No more follow-ups arrive.
- [ ] Portal → the role → Omar's row shows **replied**. Portal → **Pipeline** shows the card under **Replied**.
- [ ] Approve a second candidate, then in the portal (role page) click **Stop** next to them → ✅ status "stopped", no more emails.
- [ ] Set `followup_delays_minutes` back to `[4320, 5760]`.

### Test 5: Approving from a general question (no role yet)
- [ ] `/find who has Xero experience and speaks Arabic?` → ✅ Nadia Farouk, with a **dropdown "✅ Approve for role…"** instead of a button (because the question wasn't tied to a role).
- [ ] Pick a role in the dropdown → ✅ same approval flow as Test 4.
- [ ] Or tie the question to a role: `/find #1 who has 3+ years of GHL?` (role numbers are shown in the portal).

### Test 6: Every CV becomes searchable, updated CV replaces old, unreadable flagged
- [ ] Portal → **CVs**: ✅ "Unique people 55". ✅ `Lina_Khoury_CV.docx` and `Layla_Hassan_CV.pdf` are **superseded** (or "older version"), replaced by the 2026 files. ✅ `RaniaAziz-CV (1).pdf`, `omar haddad cv final.docx` and one Bilal file are **duplicate**. ✅ `Scan_0007.pdf` "OCR (scan)". ✅ red box with the 2 **unreadable** files and the reason.
- [ ] Upload test: **CVs → Choose Files** → `data\hard_cases\blank_scan.pdf` → **Upload** → ✅ "⚠️ unreadable: …" + a new ⚠️ alert in Slack.
- [ ] Upload test: upload `data\cvs\Omar_Haddad_CV.pdf` again → ✅ "♻️ identical file already stored": Omar is still one person.

### Test 7: Test page (10 questions + score)
- [ ] Portal → **Test** → **▶ Run the test now** → wait 2–3 minutes (the page refreshes by itself).
- [ ] ✅ A big score like **9/10** or **10/10**, and for each question: the question, the right answer, what the bot answered (names, scores, CV files) and ✔ pass / ✘ fail with the exact reason.
- [ ] Use the **"Try your own question"** box at the bottom with any question. ✅ Results with scores and CV files.
- [ ] If a question fails, read the reason shown (e.g. "missing X") and tell me. I'll tune it.

### Test 8: Safety checks
- [ ] Open the portal in a private/incognito window → ✅ you're asked for the password. A wrong password → "Wrong password".
- [ ] Portal → **Activity**: ✅ every step you did is listed (JD created/approved, candidate approved, emails sent, reply, CV flags).
- [ ] Make n8n fail on purpose (optional): temporarily switch off the `HG- OpenAI` credential's key → run `/find test` → ✅ Slack shows 🚨 "workflow failed at …" with a link. Then fix the key.

---

## Phase 12: Record the Loom and submit

### Loom (max 3 minutes, English)
⚠️ Before recording: close `.env`, n8n Credentials, Vercel Environment Variables and Supabase API pages. **No keys on screen.**

| Time | Show | Say |
|---|---|---|
| 0:00 | Portal Roles page | "An AI recruiting copilot: transcript to job description, to shortlist, to outreach. A recruiter approves every step." |
| 0:15 | Paste the BrightPath transcript → Slack JD arrives | "The AI writes the JD; private remarks stay internal." |
| 0:35 | **Request changes** → v2 → **Approve** → client email in Gmail | "Nothing reaches the client before Approve." |
| 0:55 | Shortlist: score, 2 lines, 📄 CV; point at Sara's scanned CV and Lina's 2026 CV | "Every recommendation names its CV; scanned and updated CVs are handled." |
| 1:20 | `/find …10+ years Salesforce and Japanese` → No good match | "It never invents a candidate." |
| 1:40 | **Approve for outreach** → GHL card → email 1 → reply → Slack 📬 → GHL Replied | "Approved candidates go to GHL; the sequence stops when they reply." |
| 2:30 | Portal CVs page (duplicates, unreadable flagged) → Test page score | "Unreadable CVs are flagged, never skipped, and the bot scores X/10 on our test." |
| 2:50 | — | "Keys live only in n8n and Vercel; everything is prefixed HG-." |

### Submission checklist (post in the project thread)
- [ ] **Live link:** your Vercel portal URL (+ the portal password, sent privately to the grader)
- [ ] **Repo link:** github.com/<you>/hg-recruiting-copilot (contains the n8n JSON in `n8n/workflows/`, README with every decision)
- [ ] **Loom link**
- [ ] (Optional) invite the grader to your Slack workspace so they can try `/find` themselves
- [ ] Double-check: the repo has **no `.env`**, and the Loom shows **no keys**

---

## Daily use (cheat sheet for a recruiter)

| I want to… | Do this |
|---|---|
| Turn a client call into a JD | Portal → Roles → **+ New role** → paste transcript. (Or in Slack: `/jd ` + paste.) |
| Approve / change / reject a JD | Buttons on the Slack message: **✅ Approve**, **✏️ Request changes**, **❌ Reject** |
| Get a shortlist | Automatic after approving the JD |
| Ask a question | `/find who has 3+ years of GHL and speaks Arabic?` |
| Ask for a specific role | `/find #3 who has QuickBooks and Gusto?` |
| Contact a candidate | **✅ Approve for outreach** (or the dropdown **Approve for role…**) |
| Skip a candidate | **❌ Not a fit** |
| Stop emails to someone | Portal → role → **Stop** |
| Add CVs | Portal → **CVs** → Choose files → Upload (PDF or Word; several at once) |
| See the pipeline | Portal → **Pipeline**, or GHL → Opportunities → HG- Candidates |
| See everything that happened | Portal → **Activity** |

---

## Troubleshooting

| What you see | What to do |
|---|---|
| `setup.py check` ❌ Supabase 401/403 | Wrong key. Use the **service_role** / **secret** key, not anon/publishable. |
| `setup.py check` ❌ Supabase 404 / "relation does not exist" | Run `supabase/schema.sql` again in the SQL Editor (Phase 2). |
| `setup.py check` ❌ OpenAI 404 model | Your account can't use `gpt-4.1-mini`: set `OPENAI_MODEL=gpt-4o-mini` in `.env` → `python scripts\setup.py supabase`. |
| `setup.py check` ❌ GHL / pipeline not found | Check the name is exactly `HG- Candidates` and the 7 stage names match Phase 4. Then `python scripts\setup.py supabase`. |
| `setup.py` says "credential not created" | Create that credential by hand (table in 7.5), put its ID in `.env`, run `python scripts\setup.py n8n` again. |
| A workflow is "not activated" | Open it in n8n, look for nodes with a red ⚠️, select the right `HG-` credential, Save, toggle Active. |
| Slack: `dispatch_failed` / "app did not respond" | HG-04 and HG-05 must be **Active**. In api.slack.com/apps → your app → **Slash Commands** and **Interactivity**, the URLs must end with `/webhook/hg-p3-slack-command` and `/webhook/hg-p3-slack-action`. |
| Slack: "⛔ Request not verified" | `SLACK_VERIFICATION_TOKEN` is wrong → fix `.env` → `python scripts\setup.py supabase`. |
| 🚨 "Slack API error: not_in_channel" | In the channel: `/invite @HG Recruiting Copilot`. |
| 🚨 "workflow failed" messages | That's the alarm working. Click **Open the execution** to see the failing node and its message. |
| No outreach email | `HG- Gmail` must be connected (Phase 5B). HG-06 and HG-07 must be active. Look in Spam / All Mail. |
| Reply not detected | Reply **in the same email thread** (click Reply on the outreach email). Wait 2 minutes. |
| Portal: login loops / "PORTAL_PASSWORD is not set" | Add the variable in Vercel → **Redeploy**. |
| Portal: "n8n 401/403" | `WEBHOOK_SECRET` in Vercel must equal the one in `.env` → Redeploy. |
| Portal: "Database error 401" | `SUPABASE_SERVICE_KEY` in Vercel is wrong → fix → Redeploy. |
| Portal Pipeline says "GHL is not configured" | `GHL_API_KEY` missing in Vercel, or run `python scripts\setup.py supabase` so the pipeline ID is saved. |
| Upload: "n8n took too long" | Big or scanned files can take ~60 s. Check n8n → HG-02 executions; the file is usually still processed. |
| Something else | Copy the exact error message and send it to me. |

---

## Optional: offline tests and portal preview (no accounts needed)
Needs Node.js installed (nodejs.org, LTS version).
```
node tests\test_code_nodes.js      → 21/21 passed
node tests\test_portal_api.js      → portal API security checks: all passed
python tests\lint_workflows.py     → All workflow references are valid
node tests\portal_dev_server.js    → open http://localhost:3939, password: demo (fake data)
```

## After the demo (real use only, never in the shared sandbox)
Supabase → `hg_settings` → `test_mode` → `false`. From then on, emails go to real candidate and client addresses.



## Why it happened: The CV upload is handled by n8n workflow HG- 02 CV Ingest, and that workflow isn't in n8n at all. Neither are HG- 01 Transcript to JD and HG- 03 Candidate Search API. So each upload got "webhook not registered" back, and the script printed it as ?.

Why they're missing: I re-ran python scripts/setup.py n8n. It updates existing workflows rather than duplicating them, so this was safe. The other six imported and are active. The demo n8n server's firewall (WAF) blocked those same three with a 403 "Blocked" page. It isn't checking your login. It's rejecting what's inside those workflow files, probably the SQL or code text, which a firewall can mistake for an attack. The import failed the same way in step 7.2; the error just scrolled past.

What to do:
1. Import the three by hand. In n8n, go to Workflows → Create → Import from File and import:
   - n8n\ready\HG-01_Transcript_to_JD.json
   - n8n\ready\HG-02_CV_Ingest.json
   - n8n\ready\HG-03_Candidate_Search_API.json

   Save each one, then switch it Active. If a node shows a red ⚠️, pick the matching HG- credential first. This is the manual route from step 7.8.
2. If the browser also shows "Blocked", the firewall applies to the website too. Then the server owner has to allow it. Send them this request ID: a51b2ca1ee35c7c8, plus "importing an n8n workflow via the API".
3. Once all three are active, run the Phase 8 upload again. You should see real results like created or duplicate instead of ?. blank_scan.pdf and corrupt_cv.pdf are meant to be flagged; that's expected.


## Yes, First version goes in the Summary (required) box at the bottom left. (Your photo didn't come through, so this is based on what's in your project folder.)

Why you can't press Commit to main: GitHub Desktop didn't turn your project folder into a repository. It made a new, empty folder inside it, Project 3\hg-recruiting-copilot\, which holds only an automatic .gitattributes file. That empty folder is what GitHub Desktop has open. It has nothing to commit, so the button stays grey.

This happens when you use File → New repository with the project folder as the "Local path". Step 9.3 uses File → Add local repository instead.

How to fix it:
1. In GitHub Desktop, open Repository → Remove… to remove hg-recruiting-copilot from the app. Removing it doesn't delete any of your files.
2. In File Explorer, delete the empty folder Project 3\hg-recruiting-copilot. Your real files are not in it; it only has .git and .gitattributes.
3. In GitHub Desktop, choose File → Add local repository and pick the Project 3 folder itself.
4. It will say "This directory does not appear to be a Git repository". Click create a repository there. In that form:
   - Set Name to hg-recruiting-copilot.
   - Make sure Local path is ...\Ai Consultant\Project 3 and not a subfolder.
   - Click Create repository.
5. The Changes tab on the left should now list many files (data, n8n, portal…). ⚠️ Make sure .env is not in that list. Your .gitignore already excludes it.

   If GitHub Desktop made its own first commit and Changes says "No local changes", that's fine. Your files are already committed, so skip to step 7.
6. Type First version in Summary, then click Commit to main.
7. Click Publish repository.

Your .gitignore also excludes .env.example, so it won't appear in the list. That doesn't matter for this step.
