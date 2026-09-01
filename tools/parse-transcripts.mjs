#!/usr/bin/env node
// Token + transcript accounting for Claude Code sessions.
//
// Scans ~/.claude/projects for sessions whose `cwd` matches the fixture and
// whose mtime falls in the window [since, until] (or from runs.json), then:
//   - splits main-thread vs subagent token usage (dedup by message id)
//   - extracts per-agent prompts (workflow + Task-tool subagents)
//   - copies workflow scripts/journals into results/
//   - extracts the final assistant message (the audit report) per session
//
// Usage:
//   node tools/parse-transcripts.mjs --fixture <abs-or-cwd-relative path> \
//        [--since "2026-09-01T10:00:00"] [--until "2026-09-01T12:00:00"] \
//        [--exp exp1] [--tag mylabel]
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const ROOT = resolve(import.meta.dirname, '..')
const fixture = arg('fixture')
if (!fixture) {
  console.error('--fixture is required')
  process.exit(1)
}
const exp = arg('exp', 'exp1')
const tag = arg('tag', '')
const since = arg('since', '1970-01-01')
const untilArg = arg('until', '2999-01-01')
const sinceMs = Date.parse(since)
const untilMs = Date.parse(untilArg)
const fixtureAbs = resolve(fixture)

const PROJECTS = join(homedir(), '.claude', 'projects')
const munge = (p) => p.replace(/:/g, '-').replace(/[\\/]/g, '-')
const projectDir = join(PROJECTS, munge(fixtureAbs))

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function* linesOf(file) {
  const raw = readFileSync(file, 'utf8')
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {
      /* tolerate corrupt lines */
    }
  }
}

function usageOf(u) {
  if (!u) return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0,
  }
}

function sumUsage(list) {
  return list.reduce(
    (a, b) => ({
      input: a.input + b.input,
      output: a.output + b.output,
      cacheRead: a.cacheRead + b.cacheRead,
      cacheCreate: a.cacheCreate + b.cacheCreate,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  )
}

function total(u) {
  return u.input + u.output + u.cacheRead + u.cacheCreate
}

function firstUserText(lines) {
  for (const l of lines) {
    if (l.type !== 'user') continue
    const c = l.message?.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      const t = c.find((b) => b.type === 'text')
      if (t?.text) return t.text
    }
  }
  return ''
}

function lastAssistantText(lines) {
  let last = ''
  for (const l of lines) {
    if (l.type !== 'assistant') continue
    const c = l.message?.content
    if (Array.isArray(c)) {
      const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      if (t.trim()) last = t
    }
  }
  return last
}

function filesIn(text) {
  const out = new Set()
  for (const m of String(text || '').matchAll(/src[/\\][\w\-.\\/]+\.ts/g)) {
    out.add(m[0].replace(/\\/g, '/'))
  }
  return [...out]
}

// All subagent-side output we can find: Task tool_results in the main
// thread + final assistant text of each sidechain transcript. Used for
// "collective findings" grading (what was actually discovered, even if the
// orchestrator never delivered a consolidated report).
function collectiveOutput(lines, sessionDir) {
  const chunks = []
  for (const l of lines) {
    if (typeof l.toolUseResult === 'string' && l.toolUseResult.length > 0) chunks.push(l.toolUseResult)
    if (l.toolUseResult && typeof l.toolUseResult === 'object' && typeof l.toolUseResult.content === 'string') {
      chunks.push(l.toolUseResult.content)
    }
  }
  try {
    for (const f of walk(sessionDir)) {
      if (f.endsWith('.jsonl') && /[\\/]subagents[\\/]/.test(f)) {
        const t = lastAssistantText([...linesOf(f)])
        if (t) chunks.push(t)
      }
    }
  } catch {
    /* no session dir */
  }
  return chunks.join('\n\n=====\n\n')
}

function analyzeSession(jsonlPath) {
  const lines = [...linesOf(jsonlPath)]
  const sessionDir = jsonlPath.replace(/\.jsonl$/, '')
  const sessionId = basename(jsonlPath, '.jsonl')

  // main thread: dedupe usage by message id
  const seen = new Map()
  let maxCtx = 0
  const taskSpawns = []
  for (const l of lines) {
    if (l.isSidechain === true) continue
    const u = l.message?.usage
    if (u && l.message?.id && !seen.has(l.message.id)) {
      seen.set(l.message.id, usageOf(u))
      const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      if (ctx > maxCtx) maxCtx = ctx
    }
    // Task-tool spawns by the orchestrator (NL arm)
    const c = l.message?.content
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b.type === 'tool_use' && /^(Task|Agent)$/i.test(b.name ?? '')) {
          taskSpawns.push({
            description: b.input?.description ?? '',
            prompt: (b.input?.prompt ?? '').slice(0, 2000),
          })
        }
      }
    }
  }

  const mainUsage = sumUsage([...seen.values()])

  // subagent transcripts live next to the session file
  const agents = []
  const wfScripts = []
  if (statSync(jsonlPath).isFile()) {
    try {
      const rel = walk(sessionDir)
      for (const f of rel) {
        if (f.endsWith('.jsonl') && /[\\/]subagents[\\/]/.test(f) && /agent-.*\.jsonl$/.test(f)) {
          const alines = [...linesOf(f)]
          const perMsg = new Map()
          for (const l of alines) {
            if (l.message?.usage && l.message?.id && !perMsg.has(l.message.id)) {
              perMsg.set(l.message.id, usageOf(l.message.usage))
            }
          }
          agents.push({
            file: f,
            kind: /[\\/]workflows[\\/]/.test(f) ? 'workflow' : 'task',
            prompt: firstUserText(alines).slice(0, 2000),
            usage: sumUsage([...perMsg.values()]),
          })
        }
        if (f.endsWith('.js') && /[\\/]workflows[\\/]scripts[\\/]/.test(f)) {
          wfScripts.push(f)
        }
        if (f.endsWith('wf_*.json'.replace('*', '')) && /[\\/]workflows[\\/]/.test(f) === false) {
          /* noop */
        }
      }
    } catch {
      /* session dir may not exist */
    }
  }

  return {
    sessionId,
    jsonl: jsonlPath,
    mtime: statSync(jsonlPath).mtimeMs,
    cwd: lines.find((l) => l.cwd)?.cwd ?? '',
    main: { ...mainUsage, total: total(mainUsage), maxContextTokens: maxCtx },
    subagents: agents,
    subagentsTotal: total(sumUsage(agents.map((a) => a.usage))),
    taskSpawns,
    filesAudited: [...new Set(agents.flatMap((a) => filesIn(a.prompt)))],
    grandTotal: total(mainUsage) + total(sumUsage(agents.map((a) => a.usage))),
    report: lastAssistantText(lines),
    collective: collectiveOutput(lines, sessionDir),
    workflowScripts: wfScripts,
  }
}

// ---- collect candidate sessions ----
const candidates = []
const dirs = readdirSync(PROJECTS, { withFileTypes: true }).filter((e) => e.isDirectory())
for (const d of dirs) {
  const pdir = join(PROJECTS, d.name)
  let files
  try {
    files = readdirSync(pdir).filter((f) => f.endsWith('.jsonl'))
  } catch {
    continue
  }
  for (const f of files) {
    const fp = join(pdir, f)
    const st = statSync(fp)
    if (st.mtimeMs < sinceMs || st.mtimeMs > untilMs) continue
    // cheap cwd check: scan first lines
    let cwdMatch = false
    for (const l of linesOf(fp)) {
      if (l.cwd) {
        cwdMatch = resolve(l.cwd) === fixtureAbs
        break
      }
    }
    if (cwdMatch) candidates.push(fp)
  }
}

const results = candidates.map(analyzeSession)
results.sort((a, b) => a.mtime - b.mtime)

const outDir = join(ROOT, 'results', exp)
mkdirSync(outDir, { recursive: true })
const label = tag ? `-${tag}` : ''
const outFile = join(outDir, `usage${label}.json`)

// artifacts: reports + collective output + workflow scripts
for (const r of results) {
  mkdirSync(join(outDir, 'raw', r.sessionId), { recursive: true })
  writeFileSync(join(outDir, 'raw', r.sessionId, 'report.md'), r.report)
  writeFileSync(join(outDir, 'raw', r.sessionId, 'collective.txt'), r.collective)
  for (const wf of r.workflowScripts) {
    copyFileSync(wf, join(outDir, 'raw', r.sessionId, basename(wf)))
  }
}

const slim = results.map((r) => ({
  ...r,
  workflowScripts: r.workflowScripts.map((w) => basename(w)),
  collective: undefined,
  subagents: r.subagents.map((a) => ({ kind: a.kind, prompt: a.prompt, usage: a.usage, total: total(a.usage) })),
}))
writeFileSync(outFile, JSON.stringify(slim, null, 2))

console.log(`sessions matched: ${results.length}`)
for (const r of results) {
  console.log(
    `- ${r.sessionId.slice(0, 8)} main=${r.main.total} (ctxMax=${r.main.maxContextTokens}) subagents=${r.subagents.length} subTotal=${r.subagentsTotal} grand=${r.grandTotal}`,
  )
}
console.log(`written: ${outFile}`)
