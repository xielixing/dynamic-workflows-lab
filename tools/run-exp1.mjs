#!/usr/bin/env node
// Run the Exp1 matrix: N fresh `claude -p` sessions per arm against the
// exp1-audit fixture, resetting the fixture between runs.
//
// Usage: node tools/run-exp1.mjs --runs 5 --arms nl,wf
import { spawnSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}

const ROOT = resolve(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'fixtures', 'exp1-audit')
const OUT = join(ROOT, 'results', 'exp1')
const RUNS = parseInt(arg('runs', '5'), 10)
const ARMS = arg('arms', 'nl,wf').split(',')
const TIMEOUT_MS = 30 * 60 * 1000

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

mkdirSync(join(OUT, 'raw'), { recursive: true })
const runsIndex = []

for (const arm of ARMS) {
  const promptFile = join(ROOT, 'prompts', arm === 'nl' ? 'exp1-nl.md' : 'exp1-wf.md')
  const prompt = readFileSync(promptFile, 'utf8').trim()

  for (let i = 1; i <= RUNS; i++) {
    // reset fixture to pristine state
    execSync('git checkout -- . && git clean -fd', { cwd: FIXTURE, stdio: 'pipe' })

    const start = Date.now()
    const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude'
    const res = spawnSync(
      bin,
      ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
      { cwd: FIXTURE, encoding: 'utf8', timeout: TIMEOUT_MS, input: prompt, shell: process.platform === 'win32' },
    )
    const end = Date.now()

    let parsed = null
    try {
      parsed = JSON.parse(res.stdout ?? '')
    } catch {
      /* non-JSON output (error) */
    }
    const sessionId = newestSession(start - 2000)
    const record = {
      exp: 'exp1',
      arm,
      run: i,
      startedAt: new Date(start).toISOString(),
      durationMs: end - start,
      exit: res.status,
      sessionId,
      result: parsed?.result ?? null,
      isError: parsed?.is_error ?? null,
      costUsd: parsed?.total_cost_usd ?? null,
      stderr: (res.stderr ?? '').slice(0, 2000),
    }
    writeFileSync(join(OUT, 'raw', `run-${arm}-${i}.json`), JSON.stringify(record, null, 2))
    runsIndex.push({ arm, run: i, sessionId, durationMs: record.durationMs, exit: record.exit })
    console.log(`run-${arm}-${i}: exit=${record.exit} dur=${Math.round(record.durationMs / 1000)}s session=${sessionId}`)
  }
}

writeFileSync(join(OUT, 'runs.json'), JSON.stringify(runsIndex, null, 2))
console.log('done → results/exp1/runs.json')
