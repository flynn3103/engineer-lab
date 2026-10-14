#!/usr/bin/env node
/* Export a skill-set course into Claude Code plugin skills: one skill per ready module.
 *   node export-plugin-skills.js <course.html> <outDir> [--only id1,id2] [--with-references]
 *   node export-plugin-skills.js skillset/backend-engineer/course.html ../agent-skills/plugins/platform-team/backend-engineer/skills
 * For each ready module it writes <outDir>/<skillName>/SKILL.md (when to use, output, procedure, checklist, review questions and red flags)
 * With --with-references it also writes <outDir>/<skillName>/references/lessons.md (the full lessons); by default it does not.
 * The course data stays the single source of truth: edit the course, then re-run this script. Needs module.skillName and
 * module.skillDescription; a module without them is skipped with a message. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2), withRefs = args.includes('--with-references'), only = (args.find((a, i) => args[i - 1] === '--only') || '').split(',').filter(Boolean);
const [page, out] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
if (!page || !out) { console.error('usage: node export-plugin-skills.js <course.html> <outDir> [--only id,id]'); process.exit(2); }
const html = fs.readFileSync(page, 'utf8'), dir = path.dirname(page);
const ctx = { console, TextEncoder, TextDecoder }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  if (/^https?:/.test(m[1])) continue;
  new vm.Script(fs.readFileSync(path.resolve(dir, m[1]), 'utf8'), { filename: m[1] }).runInContext(ctx);
}
const D = ctx.SkillData;
if (!D) { console.error('page does not define SkillData'); process.exit(1); }

/* the course text carries a little HTML; turn it into Markdown */
const md = h => String(h == null ? '' : h)
  .replace(/<pre>([\s\S]*?)<\/pre>/g, (_, c) => '\n```\n' + c.replace(/<[^>]+>/g, '') + '\n```\n')
  .replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<\/?b>/g, '**').replace(/<\/?i>/g, '*').replace(/<br\s*\/?>/g, '\n')
  .replace(/<small>(.*?)<\/small>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const cell = h => md(h).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => '| ' + head.map(cell).join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n' + rows.map(r => '| ' + r.map(cell).join(' | ') + ' |').join('\n') + '\n';
const oneLine = s => md(s).replace(/\s+/g, ' ').trim();

let written = 0;
for (const m of D.modules) {
  if (m.status !== 'ready' || (only.length && !only.includes(m.id))) continue;
  if (!m.skillName || !m.skillDescription) { console.log('skip ' + m.id + ': needs skillName and skillDescription'); continue; }
  const L = D.lessons[m.id], sd = path.join(out, m.skillName); fs.mkdirSync(sd, { recursive: true });
  const desc = JSON.stringify(oneLine(m.skillDescription));
  let s = `---\nname: ${m.skillName}\ndescription: ${desc}\nmetadata:\n  course: ${D.config.id}/${m.id}\n---\n\n# ${oneLine(m.name)}\n\n${md(m.goal)}\n\n`;
  s += `## When to use\n${L.map(l => '- ' + oneLine(l.title) + ': ' + oneLine(l.short)).join('\n')}\n\n`;
  s += `## Output\n${md(m.artifact)}\n\n`;
  s += `## How you work (intended behavior of the agent with this skill)\n${md(m.agent)}\n\n`;
  s += `## Procedure\nWork through the lessons that apply. Each step is one move; do not skip the evidence.\n\n`;
  L.forEach((l, i) => { s += `### ${i + 1}. ${oneLine(l.title)}\n${l.technique.map((t, k) => `${k + 1}. **${oneLine(t.t)}**. ${oneLine(t.x)}`).join('\n')}\n\n`; });
  s += `## Checklist before you call it done\n${L.map(l => `**${oneLine(l.title)}**\n${l.checklist.map(c => '- [ ] ' + oneLine(c)).join('\n')}`).join('\n\n')}\n\n`;
  s += `## Questions to ask and red flags to look for (when reviewing)\n${L.map(l => `**${oneLine(l.title)}**\n${l.review.map(q => '- ' + oneLine(q)).join('\n')}`).join('\n\n')}\n\n`;
  if (withRefs) s += `## Reference\nThe full lessons (why, the idea, a worked example with diagrams, common mistakes, an exercise with an answer, and sources) are in \`references/lessons.md\`. Read the lesson for the step you are on when the procedure above is not enough. All numbers in the examples are invented.\n`;
  fs.writeFileSync(path.join(sd, 'SKILL.md'), s);
  if (withRefs) {
  let r = `# ${oneLine(m.name)}: lessons\n\nGenerated from the ${D.config.name} course (module \`${m.id}\`). Do not edit by hand: change the course and re-export.\n\n`;
  L.forEach((l, i) => {
    r += `## ${i + 1}. ${oneLine(l.title)}\n\n${oneLine(l.short)}\n\n### Why it matters\n${md(l.why)}\n\n### The idea\n${l.concept.map(md).join('\n\n')}\n\n`;
    if (l.terms) r += table(['Term', 'Meaning'], l.terms) + '\n';
    r += `### Worked example\n${md(l.example.setup)}\n\n`;
    (D.diagrams[m.id + ':' + (i + 1)] || []).forEach(d => { r += `*${oneLine(d.kind)}: ${oneLine(d.title)}*\n\n\`\`\`mermaid\n${d.src.trim()}\n\`\`\`\n\n`; });
    r += l.example.body.map(md).join('\n\n') + '\n\n';
    if (l.example.table) r += table(l.example.table.head, l.example.table.rows) + '\n';
    r += `### Common mistakes\n${l.mistakes.map((x, k) => `${k + 1}. **${oneLine(x.t)}**. ${oneLine(x.ctx)} *Instead:* ${oneLine(x.fix)}`).join('\n')}\n\n`;
    r += `### Practice\n${md(l.exercise.prompt)}\n\n**Model answer.** ${md(l.exercise.answer)}\n\n### Sources\n${oneLine(l.src)}\n\n`;
  });
  fs.mkdirSync(path.join(sd, 'references'), { recursive: true });
  fs.writeFileSync(path.join(sd, 'references', 'lessons.md'), r);
  }
  written++; console.log('wrote ' + m.skillName + ' (' + L.length + ' lessons)');
}
console.log(written + ' skills written to ' + out);
