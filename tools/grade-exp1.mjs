#!/usr/bin/env node
// Grade Exp1: coverage / recall / precision / cross-run stability, joined
// with token accounting from parse-transcripts.
//
// Prereqs: tools/run-exp1.mjs then tools/parse-transcripts.mjs --exp exp1
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'results', 'exp1')
const GT = JSON.parse(readFileSync(join(ROOT, 'grading', 'exp1-ground-truth.json'), 'utf8'))
const RUNS = JSON.parse(readFileSync(join(OUT, 'runs.json'), 'utf8'))
const usageFile = join(OUT, 'usage-all.json')
const USAGE = existsSync(usageFile) ? JSON.parse(readFileSync(usageFile, 'utf8')) : []
const usageBySession = new Map(USAGE.map((u) => [u.sessionId, u]))

function extractFindings(report) {
  const findings = []
  // JSON blocks first
  const jsonBlocks = [...report.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1])
  for (const block of jsonBlocks) {
    try {
      const arr = JSON.parse(block)
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && typeof item === 'object' && (item.file || item.path)) {
            findings.push({
              file: String(item.file ?? item.path),
              line: Number(item.line ?? NaN),
              call: String(item.call ?? item.function ?? ''),
            })
          }
        }
      }
    } catch {
      /* not JSON */
    }
  }
  if (findings.length > 0) return findings
  // fallback: mention-style "src/....ts:LINE" or "file.ts, line 12"
  const re = /(src[/\\][\w\-./\\]+\.ts)[^0-9]{0,20}(\d{1,4})/g
  for (const m of report.matchAll(re)) {
    findings.push({ file: m[1], line: Number(m[2]), call: '' })
  }
  return findings
}

function normFile(f) {
  return f.replace(/\\/g, '/').replace(/^\.?\//, '')
}

function matchGroundTruth(finding) {
  const f = normFile(finding.file)
  return GT.fixtures.findIndex((gt) => {
    const fileOk = f.endsWith(gt.file) || gt.file.endsWith(f) || f.includes(gt.file.split('/').slice(-2).join('/'))
    const lineOk = Number.isFinite(finding.line) ? Math.abs(finding.line - gt.line) <= 3 : true
    const callOk = finding.call ? gt.call.includes(finding.call) || finding.call.includes(gt.call) : true
    return fileOk && lineOk && callOk
  })
}

function metricsFor(report) {
  const findings = extractFindings(report)
  const foundGt = new Set()
  const falsePositives = []
  for (const f of findings) {
    const idx = matchGroundTruth(f)
    if (idx >= 0) foundGt.add(idx)
    else falsePositives.push(f)
  }
  const filesMentioned = new Set(
    [...report.matchAll(/src[/\\][\w\-./\\]+\.ts/g)].map((m) => normFile(m[0])),
  )
  return {
    findings,
    foundPlanted: foundGt.size,
    recall: foundGt.size / GT.fixtures.length,
    precision: findings.length > 0 ? (findings.length - falsePositives.length) / findings.length : 0,
    coverageFiles: filesMentioned.size,
    falsePositives,
  }
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 1 : inter / union
}

const rows = []
const perArm = {}
for (const r of RUNS) {
  const reportPath = r.sessionId ? join(OUT, 'raw', r.sessionId, 'report.md') : null
  const report = reportPath && existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : ''
  const collectivePath = r.sessionId ? join(OUT, 'raw', r.sessionId, 'collective.txt') : null
  const collective = collectivePath && existsSync(collectivePath) ? readFileSync(collectivePath, 'utf8') : ''
  const m = metricsFor(report)
  const mc = metricsFor(collective)
  const u = r.sessionId ? usageBySession.get(r.sessionId) : null
  const agents = u?.subagents ?? []
  const normPrompts = new Set(
    agents.map((a) => (a.prompt || '').replace(/src[/\\][\w\-./\\]+\.ts/g, '<FILE>')),
  )
  const row = {
    arm: r.arm,
    run: r.run,
    sessionId: r.sessionId,
    durationMs: r.durationMs,
    foundPlanted: m.foundPlanted,
    recall: +m.recall.toFixed(2),
    collectiveRecall: +mc.recall.toFixed(2),
    precision: +m.precision.toFixed(2),
    findingsReported: m.findings.length,
    falsePositives: m.falsePositives.length,
    filesAudited: u?.filesAudited?.length ?? 0,
    agentsSpawned: agents.length,
    taskSpawns: u?.taskSpawns?.length ?? 0,
    distinctAgentPrompts: normPrompts.size,
    mainTokens: u?.main?.total ?? null,
    mainMaxContext: u?.main?.maxContextTokens ?? null,
    subagentTokens: u?.subagentsTotal ?? null,
    grandTokens: u?.grandTotal ?? null,
    _foundSet: null,
  }
  rows.push(row)
  ;(perArm[r.arm] ??= []).push({ ...row, _foundSet: m })
}

// cross-run Jaccard on the set of planted bugs found
const stability = {}
for (const [arm, list] of Object.entries(perArm)) {
  const sets = list.map((r) => {
    const findings = r._foundSet.findings
    const s = new Set()
    for (const f of findings) {
      const idx = matchGroundTruth(f)
      if (idx >= 0) s.add(idx)
    }
    return s
  })
  let sum = 0
  let n = 0
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccard(sets[i], sets[j])
      n++
    }
  }
  const recalls = list.map((r) => r.recall)
  stability[arm] = {
    meanJaccard: n ? +(sum / n).toFixed(3) : null,
    recallValues: recalls,
    recallStddev: +Math.sqrt(
      recalls.reduce((s, v) => s + (v - recalls.reduce((a, b) => a + b, 0) / recalls.length) ** 2, 0) / recalls.length,
    ).toFixed(3),
  }
}

const lines = []
lines.push('# Exp1 summary\n')
lines.push(`ground truth: ${GT.fixtures.length} planted bugs across ${GT.totalFiles} files\n`)
lines.push('| arm | run | recall | collectiveRecall | precision | findings | FP | filesAudited | agents | distinctPrompts | mainTok | mainCtxMax | subTok | grand | dur(s) |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  lines.push(
    `| ${r.arm} | ${r.run} | ${r.recall} | ${r.collectiveRecall} | ${r.precision} | ${r.findingsReported} | ${r.falsePositives} | ${r.filesAudited}/${GT.totalFiles} | ${r.agentsSpawned} | ${r.distinctAgentPrompts} | ${r.mainTokens ?? '?'} | ${r.mainMaxContext ?? '?'} | ${r.subagentTokens ?? '?'} | ${r.grandTokens ?? '?'} | ${Math.round(r.durationMs / 1000)} |`,
  )
}
lines.push('\n## Stability\n')
for (const [arm, s] of Object.entries(stability)) {
  lines.push(`- **${arm}**: meanJaccard=${s.meanJaccard} recallRuns=${s.recallValues} stddev=${s.recallStddev}`)
}
const agg = {}
for (const [arm, list] of Object.entries(perArm)) {
  const mean = (xs) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)
  agg[arm] = {
    meanGrandTokens: mean(list.map((r) => r.grandTokens ?? 0)),
    meanMainTokens: mean(list.map((r) => r.mainTokens ?? 0)),
    meanMainCtxMax: mean(list.map((r) => r.mainMaxContext ?? 0)),
    meanRecall: +(list.reduce((a, b) => a + b.recall, 0) / list.length).toFixed(2),
    meanDurationSec: Math.round(mean(list.map((r) => r.durationMs)) / 1000),
  }
}
lines.push('\n## Aggregates\n')
lines.push('```json\n' + JSON.stringify(agg, null, 2) + '\n```')

writeFileSync(join(OUT, 'summary.md'), lines.join('\n'))
console.log(lines.join('\n'))
