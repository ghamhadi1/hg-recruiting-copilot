"""
Static checks on the generated n8n workflows:
  - every $('Node') reference points to a node that exists AND runs before it (is an ancestor)
  - every node except triggers is connected
  - webhook paths are unique, every credential reference has a name
Run: python tests/lint_workflows.py
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TRIGGERS = ("webhook", "scheduleTrigger", "errorTrigger")
problems = []
paths = {}

for f in sorted(glob.glob(os.path.join(ROOT, "n8n", "workflows", "*.json"))):
    wf = json.load(open(f, encoding="utf-8"))
    names = {n["name"]: n for n in wf["nodes"]}
    parents = {n: set() for n in names}
    for src, c in wf["connections"].items():
        for outs in c["main"]:
            for t in outs:
                parents[t["node"]].add(src)

    def ancestors(n, seen=None):
        seen = seen if seen is not None else set()
        for p in parents[n]:
            if p not in seen:
                seen.add(p)
                ancestors(p, seen)
        return seen

    for name, node in names.items():
        is_trigger = node["type"].split(".")[-1] in TRIGGERS
        if not is_trigger and not parents[name]:
            problems.append(f"{wf['name']}: '{name}' has no incoming connection")
        blob = json.dumps(node["parameters"])
        refs = set(re.findall(r"\$\(\\?['\"]([^'\"\\]+)\\?['\"]\)", blob))
        anc = ancestors(name)
        for r in refs:
            if r not in names:
                problems.append(f"{wf['name']}: '{name}' references missing node '{r}'")
            elif r not in anc:
                problems.append(f"{wf['name']}: '{name}' references '{r}' which does not run before it")
        for cred in (node.get("credentials") or {}).values():
            if not cred.get("name"):
                problems.append(f"{wf['name']}: '{name}' credential without name")
        if node["type"] == "n8n-nodes-base.webhook":
            p = node["parameters"]["path"]
            if p in paths:
                problems.append(f"duplicate webhook path {p} in {wf['name']} and {paths[p]}")
            paths[p] = wf["name"]
    print(f"{wf['name']:<32} {len(names):>3} nodes  OK" if not [p for p in problems if p.startswith(wf['name'])] else f"{wf['name']}: issues")

print("\nWebhook paths:", ", ".join(sorted(paths)))
if problems:
    print("\nPROBLEMS:\n- " + "\n- ".join(problems))
    sys.exit(1)
print("All workflow references are valid.")
