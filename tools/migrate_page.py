#!/usr/bin/env python3
"""HISTORICAL: this was the one-off converter used to move the six pages onto the shared shell.
The pages were then hand-tuned (story text, engine fixes, page CSS), so the migrated HTML files are now the
source of truth: do not re-run this on them. Kept as documentation of what the migration removed.

Migrate an end-to-end playground page onto the shared Engineer Lab shell.

The six pages were generated from one template, so their generic shell (animate loop, phase nav,
overview renderer, simulation player, accordion) is identical. This script removes that shell and
wires the page to assets/lab.css + assets/lab.js. The engine, PHASES, ctlHTML, OVS, SIMM, DETAIL stay.

usage: migrate_page.py ORIGINAL.html OUT.html STORY.js DATA.html [--stop 'js'] [--before 'js'] [--after 'js'] [--group-bottom]
"""
import re, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('story'); ap.add_argument('data')
ap.add_argument('--stop', default='', help='js run by stopAll (clear page-specific live loops)')
ap.add_argument('--before', default='', help='js body run before Play; has k')
ap.add_argument('--after', default='', help='js body run after Play; has k')
ap.add_argument('--group-bottom', action='store_true', help='overview group labels sit at the bottom edge')
ap.add_argument('--css-extra', default='', help='extra css appended to the page style')
a = ap.parse_args()

t = open(a.src, encoding='utf-8').read()

# ---------- <style> ----------
m = re.search(r'<style>(.*?)</style>', t, re.S)
css = m.group(1)
acc = re.search(r':root\{[^}]*?--acc:(#[0-9a-fA-F]+);--acc2:(#[0-9a-fA-F]+);', css)
accd = re.search(r'prefers-color-scheme:dark\)\{:root\{[^}]*?--acc:(#[0-9a-fA-F]+);--acc2:(#[0-9a-fA-F]+);', css)
DROP = (':root', '@media(prefers-color-scheme', '--p', '--t', '*{', 'body{', 'header', 'h1', 'section', 'h3{', 'button', 'label{',
        '.bar{', '.mono', 'textarea', 'pre{', '.note', '.ok{', '.box{', '.chips', '.chip{', '.tag', '.grid', '.g2', 'table{', 'td.n',
        'svg{', 'svg text', '.jobgrid', '.nav{', '.nv', '.blurb', '.caption', '.row', '.col{', '.col h4', '.meter', '.lrow', '.big', '.bar2',
        'details.dd', '@keyframes flow', '.ovn', '.ove', '.simgrid', '.simlog', '.simev', '.simtag', '#acc', 'details.acc', '.accn',
        '.acct', '.accg', '.accb', '.ddb', '.pc', 'table.fm', '@media(max-width:700px){table.fm', '@media(max-width:700px){.accg',
        '@media(max-width:700px){.pc', '.flow', '.ove.flow', '@media(max-width:900px){.simgrid', '.g2>div')
keep = [l for l in css.split('\n') if l.strip() and not l.startswith(DROP)]
style = ('<link rel="stylesheet" href="../../assets/lab.css">\n<style>\n'
         f':root{{--acc:{acc.group(1)};--acc2:{acc.group(2)}}}\n'
         f'@media(prefers-color-scheme:dark){{:root{{--acc:{accd.group(1)};--acc2:{accd.group(2)}}}}}\n'
         + '\n'.join(keep) + '\n' + a.css_extra + '\n</style>')
t = t[:m.start()] + style + t[m.end():]

# ---------- <body> up to the main <script> ----------
story = open(a.story, encoding='utf-8').read()
data = open(a.data, encoding='utf-8').read()
b0 = t.index('<body>') + len('<body>')
s0 = t.index('<script>', b0)
t = (t[:b0] + '\n<div id="dataSlot" hidden>\n' + data.strip() + '\n</div>\n<script src="../../assets/lab.js"></script>\n<script>\n' + story.strip()
     + '\n</script>\n' + t[s0:])
t = t.replace('<script>\nconst $=', '<script>\nLab.mount(STORY);\nconst $=', 1)

def cut(pat, repl='', flags=re.S | re.M, must=True, label=''):
    global t
    n, c = re.subn(pat, lambda m_: repl, t, count=1, flags=flags)
    if must and c != 1:
        sys.exit(f'migrate: region not found: {label or pat[:60]}')
    t = n

# R1 state + animate + sleep (keep extra declared vars)
mm = re.search(r'^let gen=0,([^;\n]*);', t, re.M)
extras = [x for x in mm.group(1).split(',') if x.split('=')[0] not in ('paused', 'speed', 'cur', 'playingAll')]
cut(r'^let gen=0.*?^const sleep=[^\n]*\n', ('let ' + ','.join(extras) + ';\n') if extras else '', label='R1 animate')
# R2 phase shell
cut(r"^function renderNav.*?^\$\('#speed'\)\.oninput=[^\n]*\n", label='R2 phase shell')
# R3 overview (keep OVS)
cut(r"^const OVN=Object\.fromEntries.*?^document\.getElementById\('ovClear'\)\.onclick=[^\n]*\n",
    ('OVS.groupLabelBottom=true;\n' if a.group_bottom else ''), label='R3 overview')
# R4 generic simulation
cut(r"^/\* =+\n\s+LIVE CLUSTER SIMULATION.*?^window\.simInit=simInit;window\.__sim=[^\n]*\n",
    'Lab.sim(SIMM);})();\n', label='R4 sim')
# R5 packets + accordion IIFEs
cut(r"^/\* ===== overview: packets.*?^window\.__accReady=true;\n\}\)\(\);\n", label='R5 acc')
# R6 boot
boot = ("Lab.onStop(()=>{" + a.stop + "});\n" if a.stop else '') + \
       "Lab.start({phases:PHASES,detail:DETAIL,ovs:OVS,ctl:ctlHTML,state:()=>S" + \
       (",beforePlay:k=>{" + a.before + "}" if a.before else '') + \
       (",afterPlay:k=>{" + a.after + "}" if a.after else '') + "});\n"
cut(r'^showPhase\(typeof cur[^\n]*\n', boot, label='R6 boot')

open(a.out, 'w', encoding='utf-8').write(t)
print('ok', len(t))
