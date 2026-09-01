#!/usr/bin/env node
// Run the Exp2 matrix: N fresh `claude -p` sessions per arm against the
// exp2-fix fixture. After each run: capture git diff, run verification
// (npm test + tsc), then reset the fixture.
//
// Usage: node tools/run-exp2.mjs --runs 5 --arms nl,wf
import { spawnSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const ROOT = resolve(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'exp2-fix')
const OUT = join(ROOT, 'results', 'exp2')
const RUNS = parseInt(arg('runs', '5'), 10)
const OFF = parseInt(arg('offset', '0'), 10)
const ARMS = arg('arms', 'nl,wf').split(',')
const TIMEOUT_MS = 60 * 60 * 1000

const munge = (p) => p.replace(/:/g, '-').replace(/[\\/]/g, '-')
const projectDir = join(homedir(), '.claude', 'projects', munge(FIXTURE))

function newestSession(sinceMs) {
  try {
    const files = readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(projectDir, f))
      .filter((f) => statSync(f).mtimeMs >= sinceMs)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    return files[0] ? files[0].split(/[\\/]/).pop().replace('.jsonl', '') : null
  } catch {
    return null
  }
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: FIXTURE, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts })
}

mkdirSync(join(OUT, 'raw'), { recursive: true })
const runsIndex = []

for (const arm of ARMS) {
  const promptFile = join(ROOT, 'prompts', arm === 'nl' ? 'exp2-nl.md' : 'exp2-wf.md')
  const prompt = readFileSync(promptFile, 'utf8').trim()

  for (let i = OFF + 1; i <= OFF + RUNS; i++) {
    execSync('git checkout -- . && git clean -fd', { cwd: FIXTURE, stdio: 'pipe' })

    const start = Date.now()
    const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude'
    const res = spawnSync(
      bin,
      ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
      { cwd: FIXTURE, encoding: 'utf8', timeout: TIMEOUT_MS, input: prompt, shell: process.platform === 'win32' },
    )
    const end = Date.now()

    // capture the working-tree state left behind by the agent
    const diff = sh('git diff').toString()
    const status = sh('git status --porcelain').toString()
    let testOut = ''
    let testExit = 1
    try {
      sh('npx vitest run', { timeout: 180000 })
      testExit = 0
    } catch (err) {
      testOut = String(err.stdout ?? err.message ?? '').slice(-3000)
      testExit = err.status ?? 1
    }
    if (testExit === 0) testOut = sh('npx vitest run 2>&1', { shell: true }).toString().slice(-2000)
    let tscExit = 1
    try {
      sh('npx tsc --noEmit')
      tscExit = 0
    } catch (err) {
      tscExit = err.status ?? 1
    }

    let parsed = null
    try {
      parsed = JSON.parse(res.stdout ?? '')
    } catch {
      /* non-JSON output */
    }
    const sessionId = newestSession(start - 2000)

    writeFileSync(join(OUT, 'raw', `run-${arm}-${i}.diff`), diff)
    const record = {
      exp: 'exp2',
      arm,
      run: i,
      startedAt: new Date(start).toISOString(),
      durationMs: end - start,
      exit: res.status,
      sessionId,
      testsGreen: testExit === 0,
      testOutputTail: testOut,
      tscClean: tscExit === 0,
      changedFiles: status
        .split('\n')
        .filter(Boolean)
        .map((l) => l.slice(3).trim()),
      result: parsed?.result ?? null,
      costUsd: parsed?.total_cost_usd ?? null,
      stderr: (res.stderr ?? '').slice(0, 2000),
    }
    writeFileSync(join(OUT, 'raw', `run-${arm}-${i}.json`), JSON.stringify(record, null, 2))
    runsIndex.push({
      arm,
      run: i,
      sessionId,
      durationMs: record.durationMs,
      testsGreen: record.testsGreen,
      tscClean: record.tscClean,
      changedFiles: record.changedFiles,
    })
    console.log(
      `run-${arm}-${i}: exit=${record.exit} tests=${record.testsGreen ? 'GREEN' : 'red'} tsc=${record.tscClean ? 'clean' : 'err'} files=${record.changedFiles.length} dur=${Math.round(record.durationMs / 1000)}s`,
    )
  }
}

// merge with existing runs.json so arm-split invocations accumulate
let existing = []
try {
  existing = JSON.parse(readFileSync(join(OUT, 'runs.json'), 'utf8'))
} catch {
  /* first run */
}
const merged = [...existing.filter((e) => !ARMS.includes(e.arm)), ...runsIndex]
writeFileSync(join(OUT, 'runs.json'), JSON.stringify(merged, null, 2))
console.log(`done → results/exp2/runs.json (${merged.length} runs)`)
