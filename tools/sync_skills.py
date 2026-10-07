#!/usr/bin/env python3
"""Refresh the bundled snapshot data/skills.js from the skills repo (the page also fetches it live)."""
import json, sys, urllib.request
SRC = 'https://raw.githubusercontent.com/flynn3103/agent-skills/main/skills.json'
data = json.load(urllib.request.urlopen(sys.argv[1] if len(sys.argv) > 1 else SRC, timeout=20))
open('data/skills.js', 'w', encoding='utf-8').write(
    '/* snapshot of ' + SRC + ' (tools/sync_skills.py). skills.html refreshes it live in the browser. */\nwindow.SITE_SKILLS = '
    + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
print(len(data['skills']), 'skills')
