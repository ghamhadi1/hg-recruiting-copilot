"""
HG- Recruiting Copilot: setup helper. Reads .env (never commits it).

  python scripts/setup.py check          test every connection
  python scripts/setup.py supabase       write settings + the 10 test questions into Supabase
  python scripts/setup.py n8n            prepare workflows (n8n/ready/*.json) and, with N8N_API_KEY, import them
  python scripts/setup.py slack          write slack/manifest.ready.yml with your real URLs
  python scripts/setup.py upload-cvs     send the 60 CVs (and --hard for the broken test files) through n8n
  python scripts/setup.py all            supabase + n8n + slack

Only Python's standard library is used.
"""
import base64
import glob
import json
import os
import random
import re
import secrets
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_FILE = os.path.join(ROOT, ".env")


# ------------------------------------------------------------------ env / http helpers

def load_env():
    if not os.path.exists(ENV_FILE):
        sys.exit("No .env file. Copy .env.example to .env and fill it in first.")
    env = {}
    for line in open(ENV_FILE, encoding="utf-8-sig"):  # -sig: Notepad may add a BOM
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.split(" #")[0].strip().strip('"').strip("'")
    env.setdefault("WEBHOOK_PATH_PREFIX", "hg-p3")
    env["N8N_BASE_URL"] = env.get("N8N_BASE_URL", "").rstrip("/")
    env["SUPABASE_URL"] = env.get("SUPABASE_URL", "").rstrip("/")
    if not env.get("WEBHOOK_SECRET"):
        env["WEBHOOK_SECRET"] = secrets.token_urlsafe(32)
        save_env_value("WEBHOOK_SECRET", env["WEBHOOK_SECRET"])
        print("• Generated WEBHOOK_SECRET and saved it in .env")
    return env


def save_env_value(key, value):
    text = open(ENV_FILE, encoding="utf-8-sig").read()
    if re.search(rf"^{key}=.*$", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", f"{key}={value}", text, flags=re.M)
    else:
        text += f"\n{key}={value}\n"
    open(ENV_FILE, "w", encoding="utf-8").write(text)


def req(method, url, headers=None, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "hg-setup/1.0"}
    h.update(headers or {})
    try:
        r = urllib.request.Request(url, data=data, method=method, headers=h)
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw
    except Exception as e:  # network errors
        return 0, str(e)


def sb_headers(env, mode="auto"):
    key = env["SUPABASE_SERVICE_KEY"]
    h = {"apikey": key}
    if mode == "both" or (mode == "auto" and key.startswith("eyJ")):
        h["Authorization"] = "Bearer " + key
    return h


def ghl_headers(env):
    return {"Authorization": "Bearer " + env["GHL_API_KEY"], "Version": "2021-07-28"}


def ok(flag, msg):
    print(("  ✅ " if flag else "  ❌ ") + msg)
    return flag


# ------------------------------------------------------------------ check

def cmd_check(env):
    print("Checking connections…")
    s, b = req("GET", env["SUPABASE_URL"] + "/rest/v1/hg_settings?select=key&limit=1", sb_headers(env))
    ok(s == 200 and isinstance(b, list), f"Supabase ({s}) " + ("" if s == 200 else str(b)[:150] + " → did you run supabase/schema.sql?"))
    if s == 200 and not b:
        print("     (settings table is empty or the key is not the service key)")
    s, b = req("GET", "https://api.openai.com/v1/models/" + env.get("OPENAI_MODEL", "gpt-4.1-mini"),
               {"Authorization": "Bearer " + env.get("OPENAI_API_KEY", "")})
    ok(s == 200, f"OpenAI model {env.get('OPENAI_MODEL', 'gpt-4.1-mini')} ({s})" + ("" if s == 200 else " " + str(b)[:150]))
    s, b = req("POST", "https://slack.com/api/auth.test", {"Authorization": "Bearer " + env.get("SLACK_BOT_TOKEN", "")}, {})
    ok(s == 200 and isinstance(b, dict) and b.get("ok"), "Slack bot token " + (f"(team {b.get('team')})" if isinstance(b, dict) and b.get("ok") else str(b)[:150]))
    if env.get("GHL_API_KEY"):
        s, b = req("GET", "https://services.leadconnectorhq.com/opportunities/pipelines?locationId=" + env.get("GHL_LOCATION_ID", ""), ghl_headers(env))
        names = [p.get("name") for p in (b or {}).get("pipelines", [])] if isinstance(b, dict) else []
        ok(s == 200, f"GHL ({s}) pipelines: {names}" if s == 200 else f"GHL ({s}) {str(b)[:150]}")
        if s == 200:
            ok(env.get("GHL_PIPELINE_NAME", "HG- Candidates") in names, f"pipeline '{env.get('GHL_PIPELINE_NAME', 'HG- Candidates')}' exists (create it in GHL if not)")
    if env.get("N8N_API_KEY"):
        s, b = req("GET", env["N8N_BASE_URL"] + "/api/v1/workflows?limit=1", {"X-N8N-API-KEY": env["N8N_API_KEY"]})
        ok(s == 200, f"n8n API ({s})" + ("" if s == 200 else " " + str(b)[:150]))
    else:
        print("  ➖ n8n API key not set: you will import the workflow files by hand")
    ok("@" in env.get("TEST_RECIPIENT", ""), "TEST_RECIPIENT is set (all test emails go there)")


# ------------------------------------------------------------------ supabase settings

STAGE_KEYS = {"approved": "approved", "outreach sent": "outreach_sent", "replied": "replied", "screening call": "screening_call",
              "submitted to client": "submitted_to_client", "placed": "placed", "not a fit": "not_a_fit"}


def ghl_pipeline(env):
    if not env.get("GHL_API_KEY"):
        return None, {}
    s, b = req("GET", "https://services.leadconnectorhq.com/opportunities/pipelines?locationId=" + env["GHL_LOCATION_ID"], ghl_headers(env))
    if s != 200:
        print(f"  ⚠️ GHL pipelines not readable ({s}): {str(b)[:200]}")
        return None, {}
    want = env.get("GHL_PIPELINE_NAME", "HG- Candidates").lower()
    for p in b.get("pipelines", []):
        if p.get("name", "").lower() == want:
            stages = {}
            for st in p.get("stages", []):
                k = STAGE_KEYS.get(re.sub(r"\s+", " ", st.get("name", "").lower().replace("hg-", "").replace("-", " ")).strip())
                if k:
                    stages[k] = st["id"]
            missing = [k for k in STAGE_KEYS.values() if k not in stages]
            if missing:
                print(f"  ⚠️ GHL stages not found (check spelling): {missing}")
            return p["id"], stages
    print(f"  ⚠️ No GHL pipeline named '{env.get('GHL_PIPELINE_NAME')}'. Create it first (see START_HERE.md).")
    return None, {}


def cmd_supabase(env):
    print("Writing settings to Supabase…")
    pipe_id, stages = ghl_pipeline(env)
    values = {
        "openai_model": env.get("OPENAI_MODEL", "gpt-4.1-mini"),
        "test_mode": True,
        "test_recipient": env.get("TEST_RECIPIENT", ""),
        "sender_name": env.get("SENDER_NAME", "HG Talent Team"),
        "slack_channel_id": env.get("SLACK_CHANNEL_ID", ""),
        "slack_verification_token": env.get("SLACK_VERIFICATION_TOKEN", ""),
        "ghl_location_id": env.get("GHL_LOCATION_ID", ""),
        "portal_url": env.get("PORTAL_URL", "").rstrip("/"),
        "n8n_base_url": env.get("N8N_BASE_URL", ""),
    }
    if pipe_id:
        values["ghl_pipeline_id"] = pipe_id
        values["ghl_stage_ids"] = stages
    rows = [{"key": k, "value": v} for k, v in values.items()]
    h = dict(sb_headers(env), Prefer="resolution=merge-duplicates")
    s, b = req("POST", env["SUPABASE_URL"] + "/rest/v1/hg_settings", h, rows)
    ok(s in (200, 201, 204), f"settings saved ({s}) {'' if s < 300 else str(b)[:200]}")
    qs = json.load(open(os.path.join(ROOT, "eval", "questions.json"), encoding="utf-8"))
    s, b = req("POST", env["SUPABASE_URL"] + "/rest/v1/hg_eval_questions", h, qs)
    ok(s in (200, 201, 204), f"{len(qs)} test questions saved ({s}) {'' if s < 300 else str(b)[:200]}")


# ------------------------------------------------------------------ n8n

CRED_KEYS = {"__CRED_SUPABASE__": "N8N_CRED_SUPABASE", "__CRED_OPENAI__": "N8N_CRED_OPENAI", "__CRED_SLACK__": "N8N_CRED_SLACK",
             "__CRED_GHL__": "N8N_CRED_GHL", "__CRED_WEBHOOK__": "N8N_CRED_WEBHOOK", "__CRED_GMAIL__": "N8N_CRED_GMAIL"}


def n8n_api(env, method, path, body=None):
    return req(method, env["N8N_BASE_URL"] + "/api/v1" + path, {"X-N8N-API-KEY": env["N8N_API_KEY"]}, body)


def make_credential(env, name, ctype, data):
    s, schema = n8n_api(env, "GET", f"/credentials/schema/{ctype}")
    if s == 200 and isinstance(schema, dict):
        for prop, spec in (schema.get("properties") or {}).items():
            if prop not in data and prop in (schema.get("required") or []):
                data[prop] = spec.get("default", False if spec.get("type") == "boolean" else "")
    s, b = n8n_api(env, "POST", "/credentials", {"name": name, "type": ctype, "data": data})
    if s in (200, 201) and isinstance(b, dict):
        print(f"  ✅ credential '{name}' created")
        return b["id"]
    print(f"  ❌ credential '{name}' not created ({s}): {str(b)[:200]}\n     → create it by hand in n8n and put its ID in .env")
    return None


def supabase_header_mode(env):
    """New sb_secret_ keys may refuse 'Authorization: Bearer'; n8n's Supabase credential always sends it."""
    url = env["SUPABASE_URL"] + "/rest/v1/hg_settings?select=key&limit=1"
    s, b = req("GET", url, sb_headers(env, "both"))
    if s == 200 and isinstance(b, list) and b:
        return "both"
    s2, b2 = req("GET", url, sb_headers(env, "apikey"))
    if s2 == 200 and isinstance(b2, list) and b2:
        return "apikey"
    guess = "both" if env.get("SUPABASE_SERVICE_KEY", "").startswith("eyJ") else "apikey"
    print(f"  ⚠️ Could not reach Supabase to test the key ({s}/{s2}). Did you run schema.sql? Assuming '{guess}'.")
    return guess


def cmd_n8n(env):
    print("Preparing n8n workflows…")
    mode = supabase_header_mode(env)
    ids = {ph: env.get(k) or None for ph, k in CRED_KEYS.items()}
    if env.get("N8N_API_KEY"):
        if not ids["__CRED_SUPABASE__"]:
            if mode == "both":
                ids["__CRED_SUPABASE__"] = make_credential(env, "HG- Supabase", "supabaseApi",
                                                           {"host": env["SUPABASE_URL"], "serviceRole": env["SUPABASE_SERVICE_KEY"]})
            else:
                ids["__CRED_SUPABASE__"] = make_credential(env, "HG- Supabase", "httpHeaderAuth",
                                                           {"name": "apikey", "value": env["SUPABASE_SERVICE_KEY"]})
        if not ids["__CRED_OPENAI__"]:
            ids["__CRED_OPENAI__"] = make_credential(env, "HG- OpenAI", "openAiApi", {"apiKey": env["OPENAI_API_KEY"]})
        if not ids["__CRED_SLACK__"]:
            ids["__CRED_SLACK__"] = make_credential(env, "HG- Slack Bot", "slackApi", {"accessToken": env["SLACK_BOT_TOKEN"]})
        if not ids["__CRED_GHL__"] and env.get("GHL_API_KEY"):
            ids["__CRED_GHL__"] = make_credential(env, "HG- GHL", "httpHeaderAuth", {"name": "Authorization", "value": "Bearer " + env["GHL_API_KEY"]})
        if not ids["__CRED_WEBHOOK__"]:
            ids["__CRED_WEBHOOK__"] = make_credential(env, "HG- Webhook Secret", "httpHeaderAuth", {"name": "X-HG-Secret", "value": env["WEBHOOK_SECRET"]})
        for ph, key in CRED_KEYS.items():
            if ids[ph] and not env.get(key):
                save_env_value(key, ids[ph])
        if not ids["__CRED_GMAIL__"]:
            print("  ➖ Gmail needs a one-time Google sign-in: create credential 'HG- Gmail' (Gmail OAuth2) in n8n,\n"
                  "     put its ID in .env as N8N_CRED_GMAIL, and run this command again.")

    out_dir = os.path.join(ROOT, "n8n", "ready")
    os.makedirs(out_dir, exist_ok=True)
    workflows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "n8n", "workflows", "*.json"))):
        text = open(path, encoding="utf-8").read()
        text = text.replace("__SUPABASE_URL__", env["SUPABASE_URL"]).replace("__N8N_BASE_URL__", env["N8N_BASE_URL"])
        text = text.replace("__WH__", env["WEBHOOK_PATH_PREFIX"])
        wf = json.loads(text)
        for node in wf["nodes"]:
            p = node.get("parameters", {})
            if mode == "apikey" and p.get("nodeCredentialType") == "supabaseApi":
                p["authentication"] = "genericCredentialType"
                p["genericAuthType"] = "httpHeaderAuth"
                p.pop("nodeCredentialType")
                node["credentials"] = {"httpHeaderAuth": node["credentials"]["supabaseApi"]}
            for cref in (node.get("credentials") or {}).values():
                if ids.get(cref["id"]):
                    cref["id"] = ids[cref["id"]]
        with open(os.path.join(out_dir, os.path.basename(path)), "w", encoding="utf-8") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        workflows.append(wf)
    print(f"  ✅ {len(workflows)} ready-to-import files in n8n/ready/ (Supabase auth mode: {mode})")

    if not env.get("N8N_API_KEY"):
        print("  ➖ No N8N_API_KEY: import n8n/ready/*.json by hand (see START_HERE.md)")
        return
    s, existing = n8n_api(env, "GET", "/workflows?limit=250")
    by_name = {w["name"]: w["id"] for w in (existing or {}).get("data", [])} if s == 200 else {}
    error_id = None
    created = {}
    for wf in workflows:
        body = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"], "settings": dict(wf["settings"])}
        if error_id and wf["name"] != "HG- 00 Error Alerts":
            body["settings"]["errorWorkflow"] = error_id
        if wf["name"] in by_name:
            s, b = n8n_api(env, "PUT", f"/workflows/{by_name[wf['name']]}", body)
            wid = by_name[wf["name"]]
        else:
            s, b = n8n_api(env, "POST", "/workflows", body)
            wid = b.get("id") if isinstance(b, dict) else None
        if s not in (200, 201) or not wid:
            print(f"  ❌ {wf['name']}: {s} {str(b)[:250]}")
            continue
        created[wf["name"]] = wid
        if wf["name"] == "HG- 00 Error Alerts":
            error_id = wid
        s, b = n8n_api(env, "POST", f"/workflows/{wid}/activate")
        ok(s == 200, f"{wf['name']} imported" + (" and ACTIVE" if s == 200 else f", but not activated: {str(b)[:200]}"))


# ------------------------------------------------------------------ slack

def cmd_slack(env):
    t = open(os.path.join(ROOT, "slack", "manifest.template.yml"), encoding="utf-8").read()
    t = t.replace("__N8N_BASE_URL__", env["N8N_BASE_URL"]).replace("__WH__", env["WEBHOOK_PATH_PREFIX"])
    out = os.path.join(ROOT, "slack", "manifest.ready.yml")
    open(out, "w", encoding="utf-8").write(t)
    print("  ✅ slack/manifest.ready.yml written. Paste it at api.slack.com/apps → your app → App Manifest.")


# ------------------------------------------------------------------ upload CVs

def cmd_upload(env, hard=False):
    files = sorted(glob.glob(os.path.join(ROOT, "data", "cvs", "*")))
    random.Random(7).shuffle(files)  # realistic: files arrive in random order
    if hard:
        files += sorted(glob.glob(os.path.join(ROOT, "data", "hard_cases", "*")))
    url = f"{env['N8N_BASE_URL']}/webhook/{env['WEBHOOK_PATH_PREFIX']}-cv"
    print(f"Uploading {len(files)} files to {url}")
    tally = {}
    for i, path in enumerate(files, 1):
        name = os.path.basename(path)
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        s, b = req("POST", url, {"X-HG-Secret": env["WEBHOOK_SECRET"]},
                   {"file_name": name, "data_base64": b64, "source": "bulk"}, timeout=180)
        action = b.get("action", "?") if isinstance(b, dict) else f"error {s}: {str(b)[:120]}"
        extra = ""
        if isinstance(b, dict):
            extra = b.get("reason") or b.get("name") or ""
            if b.get("extraction_method") == "ocr":
                extra += " (OCR)"
        tally[action] = tally.get(action, 0) + 1
        print(f"  {i:>2}. {name:<45} → {action} {extra}")
    print("Summary:", ", ".join(f"{k}: {v}" for k, v in tally.items()))


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return
    env = load_env()
    c = sys.argv[1]
    if c == "check":
        cmd_check(env)
    elif c == "supabase":
        cmd_supabase(env)
    elif c == "n8n":
        cmd_n8n(env)
    elif c == "slack":
        cmd_slack(env)
    elif c == "upload-cvs":
        cmd_upload(env, hard="--hard" in sys.argv)
    elif c == "all":
        cmd_supabase(env)
        cmd_n8n(env)
        cmd_slack(env)
    else:
        print(__doc__)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
