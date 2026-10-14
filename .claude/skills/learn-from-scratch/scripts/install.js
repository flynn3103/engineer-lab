#!/usr/bin/env node
/* Install (or check) the course framework in a site repo.
 *   node install.js <repoRoot>            copy missing files into <repoRoot>/assets/course and <repoRoot>/tools/course
 *   node install.js <repoRoot> --check    report files that are missing or differ from this skill's copy
 *   node install.js <repoRoot> --force    overwrite files that differ
 * The canonical, living copy is engineer-lab/assets/course. If the repo already has it, prefer the repo's copy and only use --check. */
const fs = require('fs'), path = require('path');
const [root, flag] = process.argv.slice(2);
if (!root) { console.error('usage: node install.js <repoRoot> [--check|--force]'); process.exit(2); }
const src = path.join(__dirname, '..', 'framework');
let missing = 0, differs = 0, copied = 0;
(function walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) { walk(f); continue; }
    const rel = path.relative(src, f), dest = path.join(root, rel);
    const have = fs.existsSync(dest), same = have && fs.readFileSync(dest, 'utf8') === fs.readFileSync(f, 'utf8');
    if (!have) { missing++; if (flag !== '--check') { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(f, dest); copied++; console.log('added    ' + rel); } else console.log('missing  ' + rel); }
    else if (!same) { differs++; if (flag === '--force') { fs.copyFileSync(f, dest); copied++; console.log('replaced ' + rel); } else console.log('differs  ' + rel); }
  }
})(src);
console.log(`${copied} written, ${missing} missing, ${differs} differ` + (differs && flag !== '--force' ? ' (use --force to overwrite)' : ''));
const gi = path.join(root, '.gitignore');
if (fs.existsSync(gi) && /^tools\/?$/m.test(fs.readFileSync(gi, 'utf8'))) console.log('note: .gitignore ignores tools/, so add "!tools/course/" after a "tools/*" line or the scripts will not be committed');
