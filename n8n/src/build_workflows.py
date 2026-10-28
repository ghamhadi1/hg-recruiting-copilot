"""
Builds the n8n workflow JSON files in n8n/workflows/ from readable sources:
  - node layout and wiring: this file
  - JavaScript of every Code node: n8n/src/code/*.js

Placeholders that scripts/setup.py replaces before import:
  __SUPABASE_URL__   __N8N_BASE_URL__   __WH__ (webhook path prefix)   __CRED_*__ (credential ids)

Run:  python n8n/src/build_workflows.py
"""
import json
import os
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
CODE_DIR = os.path.join(HERE, "code")
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "workflows"))
NS = uuid.UUID("6f1c2b8e-0d4a-4c1e-9a55-3e1f0b7d2a10")

SB = "__SUPABASE_URL__"
N8N = "__N8N_BASE_URL__"
OPENAI = "https://api.openai.com/v1"
GHL = "https://services.leadconnectorhq.com"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"

CRED = {
    "supabase": ("supabaseApi", {"id": "__CRED_SUPABASE__", "name": "HG- Supabase"}),
    "openai": ("openAiApi", {"id": "__CRED_OPENAI__", "name": "HG- OpenAI"}),
    "slack": ("slackApi", {"id": "__CRED_SLACK__", "name": "HG- Slack Bot"}),
    "gmail": ("gmailOAuth2", {"id": "__CRED_GMAIL__", "name": "HG- Gmail"}),
    "ghl": ("httpHeaderAuth", {"id": "__CRED_GHL__", "name": "HG- GHL"}),
    "webhook": ("httpHeaderAuth", {"id": "__CRED_WEBHOOK__", "name": "HG- Webhook Secret"}),
}


def code_src(name):
    with open(os.path.join(CODE_DIR, name + ".js"), encoding="utf-8") as f:
        return f.read()


class WF:
    def __init__(self, name):
        self.name, self.nodes, self.conns = name, [], {}

    def add(self, node, x, y=0):
        node["id"] = str(uuid.uuid5(NS, self.name + "/" + node["name"]))
        node["position"] = [x * 260, y * 200]
        self.nodes.append(node)
        return node["name"]

    def link(self, a, b, out=0):
        m = self.conns.setdefault(a, {"main": []})["main"]
        while len(m) <= out:
            m.append([])
        m[out].append({"node": b, "type": "main", "index": 0})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def to_json(self):
        names = [n["name"] for n in self.nodes]
        assert len(names) == len(set(names)), f"duplicate node names in {self.name}"
        for a, c in self.conns.items():
            assert a in names, f"{self.name}: unknown source {a}"
            for outs in c["main"]:
                for t in outs:
                    assert t["node"] in names, f"{self.name}: unknown target {t['node']}"
        return {"name": self.name, "nodes": self.nodes, "connections": self.conns,
                "settings": {"executionOrder": "v1"}, "pinData": {}}


# ---------------------------------------------------------------- node factories

def webhook(path, auth=True, mode="responseNode", name="Webhook"):
    p = {"httpMethod": "POST", "path": f"__WH__-{path}", "responseMode": mode, "options": {}}
    n = {"name": name, "type": "n8n-nodes-base.webhook", "typeVersion": 2, "parameters": p,
         "webhookId": str(uuid.uuid5(NS, "webhook/" + path))}
    if auth:
        p["authentication"] = "headerAuth"
        n["credentials"] = {"httpHeaderAuth": CRED["webhook"][1]}
    return n


def respond(name, body=None, no_data=False, code=200):
    if no_data:
        p = {"respondWith": "noData", "options": {}}
    else:
        p = {"respondWith": "json", "responseBody": body, "options": {"responseCode": code}}
    return {"name": name, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "parameters": p}


def code(name, src, each=False):
    p = {"jsCode": code_src(src)}
    if each:
        p["mode"] = "runOnceForEachItem"
    return {"name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "parameters": p}


def http(name, method, url, body=None, cred="supabase", headers=None, on_error=False, always=False,
         batch=False, timeout=None):
    p = {"method": method, "url": url}
    n = {"name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "parameters": p}
    if cred:
        ctype, cref = CRED[cred]
        if cred in ("ghl", "webhook"):
            p["authentication"] = "genericCredentialType"
            p["genericAuthType"] = "httpHeaderAuth"
        else:
            p["authentication"] = "predefinedCredentialType"
            p["nodeCredentialType"] = ctype
        n["credentials"] = {ctype: cref}
    hdrs = list(headers or [])
    if cred == "ghl":
        hdrs += [("Version", "2021-07-28"), ("Accept", "application/json")]
    if hdrs:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in hdrs]}
    if body is not None:
        p["sendBody"] = True
        p["specifyBody"] = "json"
        p["jsonBody"] = body
    opts = {}
    if timeout:
        opts["timeout"] = timeout
    if batch:
        opts["batching"] = {"batch": {"batchSize": 1, "batchInterval": 300}}
    p["options"] = opts
    if on_error:
        n["onError"] = "continueRegularOutput"
    if always:
        n["alwaysOutputData"] = True
    return n


def rpc(name, fn, body, **kw):
    return http(name, "POST", f"{SB}/rest/v1/rpc/{fn}", body=body, **kw)


def settings_node():
    return http("Load Settings", "GET", f"{SB}/rest/v1/hg_settings?select=key,value")


def config_node():
    return code("Config", "config")


def openai_chat(name, body="={{ JSON.stringify($json.openai_body) }}", **kw):
    kw.setdefault("timeout", 120000)
    return http(name, "POST", f"{OPENAI}/chat/completions", body=body, cred="openai", **kw)


def slack_post(name, body="={{ JSON.stringify($json.body) }}", method="chat.postMessage", **kw):
    return http(name, "POST", f"https://slack.com/api/{method}", body=body, cred="slack", **kw)


def post_url(name, url_expr, body="={{ JSON.stringify($json.body) }}", **kw):
    return http(name, "POST", url_expr, body=body, cred=None, **kw)


def _cond(left, op, right, typ):
    c = {"id": str(uuid.uuid4()), "leftValue": left, "rightValue": right, "operator": {"type": typ, "operation": op}}
    if op in ("true", "false", "exists", "notExists", "empty", "notEmpty"):
        c["operator"]["singleValue"] = True
        c["rightValue"] = ""
    return c


def _conds(c):
    return {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [c], "combinator": "and"}


def if_true(name, expr):
    return {"name": name, "type": "n8n-nodes-base.if", "typeVersion": 2,
            "parameters": {"conditions": _conds(_cond(expr, "true", "", "boolean")), "looseTypeValidation": True,
                           "options": {}}}


def if_equals(name, expr, value):
    return {"name": name, "type": "n8n-nodes-base.if", "typeVersion": 2,
            "parameters": {"conditions": _conds(_cond(expr, "equals", value, "string")), "looseTypeValidation": True,
                           "options": {}}}


def switch(name, expr, values):
    rules = [{"conditions": _conds(_cond(expr, "equals", v, "string")), "renameOutput": True, "outputKey": v}
             for v in values]
    return {"name": name, "type": "n8n-nodes-base.switch", "typeVersion": 3,
            "parameters": {"rules": {"values": rules}, "looseTypeValidation": True, "options": {}}}


def schedule(name, minutes):
    return {"name": name, "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
            "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": minutes}]}}}


def ghl_stage(name, opp_expr, stage_expr):
    body = ("={{ JSON.stringify({ pipelineId: $('Config').first().json.ghl_pipeline_id, pipelineStageId: " + stage_expr + " }) }}")
    return http(name, "PUT", "={{ '" + GHL + "/opportunities/' + " + opp_expr + " }}", body=body, cred="ghl", on_error=True)


# ---------------------------------------------------------------- workflows

def wf_error():
    w = WF("HG- 00 Error Alerts")
    w.add({"name": "Error Trigger", "type": "n8n-nodes-base.errorTrigger", "typeVersion": 1, "parameters": {}}, 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(code("Error Message", "error_message"), 3)
    w.add(slack_post("Post to Slack"), 4)
    w.chain("Error Trigger", "Load Settings", "Config", "Error Message", "Post to Slack")
    return w


def wf_jd():
    w = WF("HG- 01 Transcript to JD")
    w.add(webhook("transcript"), 0)
    w.add(respond("Accepted", "={{ JSON.stringify({ ok: true, message: 'The JD is being written. It will appear in Slack for approval in about 20 seconds.' }) }}", code=202), 1)
    w.add(settings_node(), 2)
    w.add(config_node(), 3)
    w.add(http("Load Role", "GET",
               f"={SB}/rest/v1/hg_roles?select=*&id=eq.{{{{ Number($('Webhook').first().json.body.role_id) || 0 }}}}",
               always=True), 4)
    w.add(code("Build JD Prompt", "jd_build_prompt"), 5)
    w.add(if_true("Transcript OK?", "={{ !$json.error }}"), 6)
    w.add(openai_chat("OpenAI: Write JD"), 7, -1)
    w.add(code("Format JD", "jd_format"), 8, -1)
    w.add(rpc("Save Role", "hg_role_save", "={{ JSON.stringify($json) }}"), 9, -1)
    w.add(code("JD Slack Message", "jd_slack"), 10, -1)
    w.add(slack_post("Post for Approval"), 11, -1)
    w.add(code("Slack OK?", "slack_check"), 12, -1)
    w.add(rpc("Save Slack Message ID", "hg_role_set_slack",
              "={{ JSON.stringify({ p_role_id: $('JD Slack Message').first().json.role_id, p_channel: $json.channel, p_ts: $json.ts }) }}"), 13, -1)
    w.add(code("Error Message", "jd_error_slack"), 7, 1)
    w.add(slack_post("Post Error"), 8, 1)
    w.chain("Webhook", "Accepted", "Load Settings", "Config", "Load Role", "Build JD Prompt", "Transcript OK?")
    w.link("Transcript OK?", "OpenAI: Write JD", 0)
    w.link("Transcript OK?", "Error Message", 1)
    w.chain("OpenAI: Write JD", "Format JD", "Save Role", "JD Slack Message", "Post for Approval", "Slack OK?", "Save Slack Message ID")
    w.chain("Error Message", "Post Error")
    return w


def wf_cv():
    w = WF("HG- 02 CV Ingest")
    w.add(webhook("cv"), 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(code("Prepare File", "cv_prepare"), 3)
    w.add(if_equals("Is PDF?", "={{ $json.ext }}", "pdf"), 4)
    w.add({"name": "Extract PDF Text", "type": "n8n-nodes-base.extractFromFile", "typeVersion": 1,
           "parameters": {"operation": "pdf", "binaryPropertyName": "data", "options": {}},
           "onError": "continueRegularOutput", "alwaysOutputData": True}, 5, -1)
    w.add(code("PDF Text", "cv_pdf_text"), 6, -1)
    w.add(if_equals("Is DOCX?", "={{ $json.ext }}", "docx"), 5, 1)
    w.add({"name": "Unzip DOCX", "type": "n8n-nodes-base.compression", "typeVersion": 1.1,
           "parameters": {"operation": "decompress", "binaryPropertyName": "data", "outputPrefix": "file_"},
           "onError": "continueRegularOutput", "alwaysOutputData": True}, 6, 0.5)
    w.add(code("DOCX Text", "cv_docx_text"), 7, 0.5)
    w.add(code("Unsupported File", "cv_unsupported"), 6, 1.5)
    w.add(code("Check Text", "cv_check_text"), 8)
    w.add(if_true("Needs OCR?", "={{ $json.needs_ocr }}"), 9)
    w.add(code("OCR Request", "cv_ocr_request"), 10, -1)
    w.add(openai_chat("OpenAI: Read Scan", on_error=True, timeout=180000), 11, -1)
    w.add(code("OCR Result", "cv_ocr_result"), 12, -1)
    w.add(if_true("Readable?", "={{ $json.readable }}"), 13)
    w.add(code("Profile Prompt", "cv_profile_prompt"), 14, -1)
    w.add(openai_chat("OpenAI: Extract Profile"), 15, -1)
    w.add(code("Profile & Chunks", "cv_chunks"), 16, -1)
    w.add(http("OpenAI: Embeddings", "POST", f"{OPENAI}/embeddings", body="={{ JSON.stringify($json.embed_body) }}",
               cred="openai", timeout=60000), 17, -1)
    w.add(code("Ingest Payload", "cv_ingest_payload"), 18, -1)
    w.add(rpc("Ingest CV", "hg_ingest_cv", "={{ JSON.stringify($json) }}"), 19, -1)
    w.add(code("CV Notice", "cv_notify"), 20, -1)
    w.add(if_true("Notify?", "={{ $json.notify }}"), 21, -1)
    w.add(slack_post("Post Notice", on_error=True), 22, -2)
    w.add(respond("Respond Saved",
                  "={{ JSON.stringify(Object.assign({ ok: true, file_name: $('Profile & Chunks').first().json.file_name, "
                  "extraction_method: $('Profile & Chunks').first().json.method }, $('Ingest CV').first().json)) }}"), 23, -1)
    w.add(code("Unreadable Payload", "cv_unreadable"), 14, 1)
    w.add(rpc("Flag Unreadable", "hg_ingest_cv", "={{ JSON.stringify({ p: $json.p }) }}"), 15, 1)
    w.add(slack_post("Alert Slack", body="={{ JSON.stringify($('Unreadable Payload').first().json.slack) }}", on_error=True), 16, 1)
    w.add(respond("Respond Flagged",
                  "={{ JSON.stringify({ ok: false, action: 'unreadable', file_name: $('Unreadable Payload').first().json.p.file_name, "
                  "reason: $('Unreadable Payload').first().json.p.unreadable_reason }) }}"), 17, 1)

    w.chain("Webhook", "Load Settings", "Config", "Prepare File", "Is PDF?")
    w.link("Is PDF?", "Extract PDF Text", 0)
    w.link("Is PDF?", "Is DOCX?", 1)
    w.chain("Extract PDF Text", "PDF Text", "Check Text")
    w.link("Is DOCX?", "Unzip DOCX", 0)
    w.link("Is DOCX?", "Unsupported File", 1)
    w.chain("Unzip DOCX", "DOCX Text", "Check Text")
    w.link("Unsupported File", "Check Text")
    w.link("Check Text", "Needs OCR?")
    w.link("Needs OCR?", "OCR Request", 0)
    w.link("Needs OCR?", "Readable?", 1)
    w.chain("OCR Request", "OpenAI: Read Scan", "OCR Result", "Readable?")
    w.link("Readable?", "Profile Prompt", 0)
    w.link("Readable?", "Unreadable Payload", 1)
    w.chain("Profile Prompt", "OpenAI: Extract Profile", "Profile & Chunks", "OpenAI: Embeddings", "Ingest Payload",
            "Ingest CV", "CV Notice", "Notify?")
    w.link("Notify?", "Post Notice", 0)
    w.link("Notify?", "Respond Saved", 1)
    w.link("Post Notice", "Respond Saved")
    w.chain("Unreadable Payload", "Flag Unreadable", "Alert Slack", "Respond Flagged")
    return w


def wf_search():
    w = WF("HG- 03 Candidate Search API")
    w.add(webhook("search"), 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(http("Load Role", "GET",
               f"={SB}/rest/v1/hg_roles?select=*&status=eq.approved&id=eq.{{{{ Number($('Webhook').first().json.body.role_id) || 0 }}}}",
               always=True), 3)
    w.add(http("Open Roles", "GET", f"{SB}/rest/v1/hg_roles?select=id,title,client_name&status=eq.approved&order=id.desc",
               always=True), 4)
    w.add(code("Build Parse Prompt", "search_parse_prompt"), 5)
    w.add(openai_chat("OpenAI: Understand Question"), 6)
    w.add(code("Parse Query", "search_after_parse"), 7)
    w.add(http("OpenAI: Embed Question", "POST", f"{OPENAI}/embeddings", body="={{ JSON.stringify($json.embed_body) }}",
               cred="openai", timeout=60000), 8)
    w.add(rpc("Search DB", "hg_search_candidates",
              "={{ JSON.stringify({ p_embedding: $json.data[0].embedding, p_terms: $('Parse Query').first().json.terms, p_limit: 20 }) }}",
              always=True), 9)
    w.add(code("Build Rank Prompt", "search_rank_prompt"), 10)
    w.add(openai_chat("OpenAI: Score Candidates"), 11)
    w.add(code("Guard & Score", "search_guard"), 12)
    w.add(if_true("Save?", "={{ $json.save }}"), 13)
    w.add(rpc("Save Search", "hg_save_search", "={{ JSON.stringify($json.save_payload) }}"), 14, -1)
    w.add(code("Format Answer", "search_format"), 15)
    w.add(respond("Respond", "={{ JSON.stringify($json) }}"), 16)
    w.chain("Webhook", "Load Settings", "Config", "Load Role", "Open Roles", "Build Parse Prompt", "OpenAI: Understand Question",
            "Parse Query", "OpenAI: Embed Question", "Search DB", "Build Rank Prompt", "OpenAI: Score Candidates",
            "Guard & Score", "Save?")
    w.link("Save?", "Save Search", 0)
    w.link("Save?", "Format Answer", 1)
    w.chain("Save Search", "Format Answer", "Respond")
    return w


def wf_slack_commands():
    w = WF("HG- 04 Slack Commands")
    w.add(webhook("slack-command", auth=False), 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(code("Verify Command", "slack_cmd_verify"), 3)
    w.add(respond("Acknowledge", "={{ JSON.stringify($json.reply) }}"), 4)
    w.add(switch("Route", "={{ $json.action }}", ["find", "jd"]), 5)
    w.add(http("Call Search API", "POST", f"{N8N}/webhook/__WH__-search", cred="webhook", on_error=True, timeout=150000,
               body="={{ JSON.stringify({ question: $('Verify Command').first().json.question, role_id: $('Verify Command').first().json.role_id, source: 'slack' }) }}"), 6, -1)
    w.add(code("Results Message", "slack_cmd_results"), 7, -1)
    w.add(post_url("Post Results", "={{ $json.url }}"), 8, -1)
    w.add(http("Call JD Writer", "POST", f"{N8N}/webhook/__WH__-transcript", cred="webhook", on_error=True,
               body="={{ JSON.stringify({ transcript: $('Verify Command').first().json.question, requested_by: $('Verify Command').first().json.user }) }}"), 6, 1)
    w.chain("Webhook", "Load Settings", "Config", "Verify Command", "Acknowledge", "Route")
    w.link("Route", "Call Search API", 0)
    w.link("Route", "Call JD Writer", 1)
    w.chain("Call Search API", "Results Message", "Post Results")
    return w


def wf_slack_actions():
    w = WF("HG- 05 Slack Buttons")
    w.add(webhook("slack-action", auth=False), 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(code("Parse Action", "slack_action_parse"), 3)
    w.add(respond("Acknowledge", no_data=True), 4)
    w.add(switch("Route", "={{ $json.action }}",
                 ["jd_approve", "jd_reject", "jd_changes", "jd_feedback", "cand_approve", "cand_reject"]), 5)
    # JD approve / reject
    w.add(rpc("JD Decide", "hg_role_decide",
              "={{ JSON.stringify({ p_role_id: $json.role_id, p_decision: $json.action === 'jd_approve' ? 'approve' : 'reject', p_user: $json.user }) }}"), 6, -3)
    w.add(code("JD Decision Message", "slack_jd_decision"), 7, -3)
    w.add(post_url("Update JD Message", "={{ $('Parse Action').first().json.response_url }}",
                   body="={{ JSON.stringify($json.update) }}", on_error=True), 8, -3)
    w.add(if_true("Approved?", "={{ $('JD Decision Message').first().json.approved }}"), 9, -3)
    w.add(if_true("Email Client?", "={{ $('JD Decision Message').first().json.send_client_email }}"), 10, -3)
    w.add(http("Email JD to Client", "POST", f"{GMAIL}/messages/send", cred="gmail", on_error=True,
               body="={{ JSON.stringify($('JD Decision Message').first().json.gmail_body) }}"), 11, -4)
    w.add(http("Auto Shortlist", "POST", f"{N8N}/webhook/__WH__-search", cred="webhook", on_error=True, timeout=150000,
               body="={{ JSON.stringify({ question: $('JD Decision Message').first().json.search_query, role_id: $('JD Decision Message').first().json.role_id, source: 'auto' }) }}"), 12, -3)
    w.add(code("Shortlist Message", "slack_post_shortlist"), 13, -3)
    w.add(slack_post("Post Shortlist"), 14, -3)
    # JD changes
    w.add(code("Feedback Form", "slack_feedback_modal"), 6, -1)
    w.add(slack_post("Open Form", method="views.open"), 7, -1)
    w.add(rpc("Request Changes", "hg_role_decide",
              "={{ JSON.stringify({ p_role_id: $json.role_id, p_decision: 'changes', p_user: $json.user, p_feedback: $json.feedback }) }}"), 6, 0)
    w.add(code("Changes Message", "slack_feedback_done"), 7, 0)
    w.add(if_true("Changes OK?", "={{ $json.ok }}"), 8, 0)
    w.add(slack_post("Mark Old Message", method="chat.update", on_error=True), 9, 0)
    w.add(http("Rewrite JD", "POST", f"{N8N}/webhook/__WH__-transcript", cred="webhook", on_error=True,
               body="={{ JSON.stringify({ role_id: $('Parse Action').first().json.role_id, feedback: $('Parse Action').first().json.feedback, requested_by: $('Parse Action').first().json.user }) }}"), 10, 0)
    # candidate approve / reject
    w.add(rpc("Candidate Decide", "hg_candidate_decide",
              "={{ JSON.stringify({ p_shortlist_id: $json.shortlist_id, p_decision: $json.action === 'cand_reject' ? 'reject' : 'approve', p_user: $json.user, p_role_id: $json.role_id || null }) }}"), 6, 2)
    w.add(code("Candidate Flags", "slack_cand_flags"), 7, 2)
    w.add(if_true("First Approval?", "={{ $json.start }}"), 8, 2)
    w.add(http("GHL Contact", "POST", f"{GHL}/contacts/upsert", cred="ghl", on_error=True,
               body="={{ JSON.stringify({ locationId: $('Config').first().json.ghl_location_id, "
                    "firstName: 'HG- ' + $json.candidate.full_name.split(' ')[0], "
                    "lastName: $json.candidate.full_name.split(' ').slice(1).join(' '), "
                    "email: $json.candidate.email || ('hg-candidate-' + $json.candidate.id + '@example.com'), "
                    "tags: ['HG-candidate', 'HG-role-' + $json.role.id], source: 'HG Recruiting Copilot' }) }}"), 9, 1.5)
    w.add(http("GHL Opportunity", "POST", f"{GHL}/opportunities/", cred="ghl", on_error=True,
               body="={{ JSON.stringify({ pipelineId: $('Config').first().json.ghl_pipeline_id, "
                    "locationId: $('Config').first().json.ghl_location_id, "
                    "name: 'HG- ' + $('Candidate Decide').first().json.candidate.full_name + ' - ' + $('Candidate Decide').first().json.role.title, "
                    "pipelineStageId: ($('Config').first().json.ghl_stage_ids || {}).approved, status: 'open', "
                    "contactId: ($json.contact || {}).id }) }}"), 10, 1.5)
    w.add(rpc("Start Outreach", "hg_start_outreach",
              "={{ JSON.stringify({ p_shortlist_id: $('Candidate Decide').first().json.shortlist_id, "
              "p_contact_id: ($('GHL Contact').first().json.contact || {}).id || null, "
              "p_opportunity_id: ($json.opportunity || {}).id || null }) }}"), 11, 1.5)
    w.add(http("Kick Sequencer", "POST", f"{N8N}/webhook/__WH__-outreach-run", cred="webhook", on_error=True,
               body="={{ JSON.stringify({ reason: 'candidate approved' }) }}"), 12, 1.5)
    w.add(code("Candidate Message", "slack_cand_message"), 13, 2)
    w.add(post_url("Reply in Slack", "={{ $json.url }}", on_error=True), 14, 2)

    w.chain("Webhook", "Load Settings", "Config", "Parse Action", "Acknowledge", "Route")
    w.link("Route", "JD Decide", 0)
    w.link("Route", "JD Decide", 1)
    w.link("Route", "Feedback Form", 2)
    w.link("Route", "Request Changes", 3)
    w.link("Route", "Candidate Decide", 4)
    w.link("Route", "Candidate Decide", 5)
    w.chain("JD Decide", "JD Decision Message", "Update JD Message", "Approved?")
    w.link("Approved?", "Email Client?", 0)
    w.link("Email Client?", "Email JD to Client", 0)
    w.link("Email Client?", "Auto Shortlist", 1)
    w.chain("Email JD to Client", "Auto Shortlist", "Shortlist Message", "Post Shortlist")
    w.chain("Feedback Form", "Open Form")
    w.chain("Request Changes", "Changes Message", "Changes OK?")
    w.link("Changes OK?", "Mark Old Message", 0)
    w.chain("Mark Old Message", "Rewrite JD")
    w.chain("Candidate Decide", "Candidate Flags", "First Approval?")
    w.link("First Approval?", "GHL Contact", 0)
    w.link("First Approval?", "Candidate Message", 1)
    w.chain("GHL Contact", "GHL Opportunity", "Start Outreach", "Kick Sequencer", "Candidate Message", "Reply in Slack")
    return w


def _reply_chain(w, x, y, src):
    """Shared tail: mark reply in DB → GHL stage Replied → Slack notice."""
    w.add(rpc("Mark Reply", "hg_mark_reply",
              "={{ JSON.stringify({ p_thread_id: $json.thread_id, p_message_id: $json.reply_message_id }) }}"), x, y)
    w.add(code("Reply Notice", "outreach_reply_notice"), x + 1, y)
    w.add(ghl_stage("GHL: Stage Replied", "$json.opportunity_id", "$json.stage_id"), x + 2, y)
    w.add(slack_post("Slack: Candidate Replied", body="={{ JSON.stringify($('Reply Notice').item.json.slack) }}", on_error=True), x + 3, y)
    w.link(src, "Mark Reply", 0)
    w.chain("Mark Reply", "Reply Notice", "GHL: Stage Replied", "Slack: Candidate Replied")


def _thread_check(w, x, src):
    w.add(code("Due Item", "outreach_due_item"), x)
    w.add(if_true("Has Thread?", "={{ $json.has_thread }}"), x + 1)
    w.add(http("Gmail: Get Thread", "GET",
               "={{ '" + GMAIL + "/threads/' + $json.thread_id + '?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject' }}",
               cred="gmail", on_error=True), x + 2, -1)
    w.add(code("Detect Reply", "outreach_detect_reply"), x + 3)
    w.add(if_true("Replied?", "={{ $json.replied }}"), x + 4)
    w.link(src, "Due Item")
    w.link("Due Item", "Has Thread?")
    w.link("Has Thread?", "Gmail: Get Thread", 0)
    w.link("Has Thread?", "Detect Reply", 1)
    w.link("Gmail: Get Thread", "Detect Reply")
    w.link("Detect Reply", "Replied?")


def wf_sequencer():
    w = WF("HG- 06 Outreach Sequencer")
    w.add(schedule("Every 5 Minutes", 5), 0, -1)
    w.add(webhook("outreach-run", mode="onReceived", name="Run Now"), 0, 1)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(rpc("Claim Due Emails", "hg_claim_due_outreach", "={{ JSON.stringify({ p_limit: 20 }) }}"), 3)
    _thread_check(w, 4, "Claim Due Emails")
    _reply_chain(w, 9, -2, "Replied?")
    w.add(code("Build Email", "outreach_build_email"), 9, 1)
    w.add(http("Gmail: Send", "POST", f"{GMAIL}/messages/send", cred="gmail", on_error=True,
               body="={{ JSON.stringify($json.gmail_body) }}"), 10, 1)
    w.add(code("After Send", "outreach_after_send"), 11, 1)
    w.add(if_true("Sent OK?", "={{ $json.ok }}"), 12, 1)
    w.add(rpc("Record Sent", "hg_outreach_sent", "={{ JSON.stringify($json.rpc) }}"), 13, 0.5)
    w.add(if_true("First Email?", "={{ $json.step === 1 && !!$('After Send').item.json.ghl_opportunity_id }}"), 14, 0.5)
    w.add(ghl_stage("GHL: Stage Outreach Sent", "$('After Send').item.json.ghl_opportunity_id",
                    "($('Config').first().json.ghl_stage_ids || {}).outreach_sent"), 15, 0.5)
    w.add(slack_post("Slack: Send Failed", on_error=True,
                     body="={{ JSON.stringify({ channel: $('Config').first().json.slack_channel_id, text: '⚠️ Could not send outreach email to ' + $json.candidate_name + ' (' + $json.role_title + '): ' + $json.error + '. Will retry in 10 minutes.' }) }}"), 13, 1.5)
    w.link("Every 5 Minutes", "Load Settings")
    w.link("Run Now", "Load Settings")
    w.chain("Load Settings", "Config", "Claim Due Emails")
    w.link("Replied?", "Build Email", 1)
    w.chain("Build Email", "Gmail: Send", "After Send", "Sent OK?")
    w.link("Sent OK?", "Record Sent", 0)
    w.link("Sent OK?", "Slack: Send Failed", 1)
    w.chain("Record Sent", "First Email?")
    w.link("First Email?", "GHL: Stage Outreach Sent", 0)
    return w


def wf_reply_watcher():
    w = WF("HG- 07 Reply Watcher")
    w.add(schedule("Every 2 Minutes", 2), 0)
    w.add(settings_node(), 1)
    w.add(config_node(), 2)
    w.add(http("Active Threads", "GET",
               f"{SB}/rest/v1/hg_outreach?select=id,thread_id,sent_message_ids&status=eq.active&thread_id=not.is.null"), 3)
    _thread_check(w, 4, "Active Threads")
    _reply_chain(w, 9, 0, "Replied?")
    w.chain("Every 2 Minutes", "Load Settings", "Config", "Active Threads")
    return w


def wf_eval():
    w = WF("HG- 08 Test Runner")
    w.add(webhook("eval"), 0)
    w.add(respond("Started", "={{ JSON.stringify({ ok: true, message: 'Test started. Results in about 2-3 minutes.' }) }}", code=202), 1)
    w.add(settings_node(), 2)
    w.add(config_node(), 3)
    w.add(http("Create Run", "POST", f"{SB}/rest/v1/hg_eval_runs", body="={{ JSON.stringify({ status: 'running' }) }}",
               headers=[("Prefer", "return=representation")]), 4)
    w.add(http("Load Questions", "GET", f"{SB}/rest/v1/hg_eval_questions?select=*&order=id"), 5)
    w.add(http("Ask the Bot", "POST", f"{N8N}/webhook/__WH__-search", cred="webhook", on_error=True, batch=True,
               timeout=150000, body="={{ JSON.stringify({ question: $json.question, source: 'eval', save: false }) }}"), 6)
    w.add(code("Score", "eval_score"), 7)
    w.add(http("Save Result", "PATCH", f"={SB}/rest/v1/hg_eval_runs?id=eq.{{{{ $json.run_id }}}}",
               body="={{ JSON.stringify($json.body) }}"), 8)
    w.chain("Webhook", "Started", "Load Settings", "Config", "Create Run", "Load Questions", "Ask the Bot", "Score", "Save Result")
    return w


WORKFLOWS = [wf_error, wf_jd, wf_cv, wf_search, wf_slack_commands, wf_slack_actions, wf_sequencer, wf_reply_watcher, wf_eval]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in WORKFLOWS:
        w = f()
        fname = w.name.replace("HG- ", "HG-").replace(" ", "_") + ".json"
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as fh:
            json.dump(w.to_json(), fh, indent=2, ensure_ascii=False)
        print(f"{fname}: {len(w.nodes)} nodes")


if __name__ == "__main__":
    main()
