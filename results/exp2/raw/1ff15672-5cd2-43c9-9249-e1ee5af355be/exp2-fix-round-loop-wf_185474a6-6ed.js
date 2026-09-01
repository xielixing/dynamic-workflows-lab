export const meta = {
  name: 'exp2-fix-round-loop',
  description: 'Fix failing TS test suite: parallel diagnosis, one fix agent per root cause, independent adversarial verifier per fix, loop until npm test + tsc are green',
  phases: [
    { title: 'Status', detail: 'run npm test + npx tsc --noEmit' },
    { title: 'Diagnose', detail: 'parallel root-cause agents, one per failing test file' },
    { title: 'Fix', detail: 'one fix agent per suspected root cause' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
  ],
}

const REPO = 'C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix'
const base = (p) => String(p).split(/[\\/]/).pop()

const STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['testsPass', 'tscPass', 'failingTests', 'tscErrors', 'summary'],
  properties: {
    testsPass: { type: 'boolean' },
    tscPass: { type: 'boolean' },
    failingTests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'name'],
        properties: { file: { type: 'string' }, name: { type: 'string' } },
      },
    },
    tscErrors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'message'],
        properties: { file: { type: 'string' }, message: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['failingTestFile', 'failingTestNames', 'affectedFile', 'rootCause', 'evidence', 'fixApproach'],
  properties: {
    failingTestFile: { type: 'string' },
    failingTestNames: { type: 'array', items: { type: 'string' } },
    affectedFile: { type: 'string' },
    rootCause: { type: 'string' },
    evidence: { type: 'string' },
    fixApproach: { type: 'string' },
    confident: { type: 'boolean' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'changeSummary', 'diffHint', 'targetTestNowPasses', 'targetTestOutput'],
  properties: {
    file: { type: 'string' },
    changeSummary: { type: 'string' },
    diffHint: { type: 'string' },
    targetTestNowPasses: { type: 'boolean' },
    targetTestOutput: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'isRealFix', 'testIntentPreserved', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['CORRECT', 'PARTIAL', 'WRONG'] },
    isRealFix: { type: 'boolean' },
    testIntentPreserved: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

function failureKeys(status) {
  const t = (status.failingTests || []).map((x) => `${x.file}::${x.name}`)
  const e = (status.tscErrors || []).map((x) => `${x.file}::${x.message}`)
  return [...t, ...e].sort()
}

function keysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function statusPrompt(round) {
  return `You are a harness gatekeeper for round ${round} of a fix loop in the repo at ${REPO} (the shell working directory is already that repo).

Run these two commands and collect results:
1. npm test     (vitest run)
2. npx tsc --noEmit

Then report EXACTLY:
- testsPass: did the full test suite exit 0?
- failingTests: one {file, name} entry for EVERY failing test. file is relative to the repo root (e.g. "tests/batching.test.ts"); name is the full vitest test name.
- tscPass: did tsc --noEmit exit 0?
- tscErrors: one {file, message} entry per emitted TS error; message should include the line number.
- summary: 1-2 sentences of the raw output highlights.

Do NOT modify any files whatsoever. Do NOT attempt fixes. This is a read-only status report. The repo is a small TypeScript fixture: source in src/, tests in tests/ (tests/ is off-limits for editing).`
}

function diagnosePrompt(file, testNames, round, status) {
  const ft = (status.failingTests || []).map((x) => `${x.file} :: ${x.name}`).join('; ')
  const te = (status.tscErrors || []).map((x) => `${x.file} :: ${x.message}`).join('; ') || 'none'
  return `You are a ROOT-CAUSE DIAGNOSTIC agent (round ${round}) for the repo at ${REPO}.

A test in "${file}" is failing:
${testNames.map((n) => `- ${n}`).join('\n')}

Current full-suite status:
- failing tests: ${ft}
- tsc errors: ${te}

Tasks:
1. Read the failing test file "${file}".
2. Read every src/ module it imports.
3. Run \`npx vitest run ${file}\` and inspect the failure output carefully.
4. Identify the ROOT CAUSE: a defect in src/ (or in a config constant that src/ uses), never in the test itself. The test reflects the intended spec.
5. Determine the exact source file that must be edited and return it as affectedFile (full path relative to repo root, e.g. "src/batching.ts" or "src/config.ts" if the defect is a config constant). Note: the defect may live in a different src/ file than the one under test (e.g. a config constant consumed by a helper).
6. Read any module-level comments/spec references (e.g. "ORD-88", "OPS-31", "FIN-19", "RET-7", "OPS-12") — they encode the intended behavior.

Return failingTestFile, failingTestNames, affectedFile, rootCause (precise), evidence (the concrete code/line that is wrong, and the failing assertion), and fixApproach (the minimal change). 
Do NOT modify any files — a separate fix agent will apply the change. Do NOT suggest weakening assertions.`
}

function fixPrompt(diag, round) {
  return `You are a FIX agent (round ${round}) in the repo at ${REPO}. Apply a minimal, root-cause fix to source so the failing test passes.

Diagnosis from another agent (treat as a hypothesis you must validate, not gospel):
- Failing test file: ${diag.failingTestFile}
- Failing test(s): ${diag.failingTestNames.join(', ')}
- Root cause: ${diag.rootCause}
- Evidence: ${diag.evidence}
- Recommended approach: ${diag.fixApproach}
- Affected source file: ${diag.affectedFile}

Constraints:
- Edit ONLY src/ files (normally just ${diag.affectedFile}; touch other src/ files only if the root cause genuinely requires it).
- NEVER modify anything under tests/.
- NEVER weaken, relax, or bypass test assertions or alter test expectations.
- Respect module comments/spec ids; prefer centralized sources of truth (e.g. if the root cause is a constant like BATCH_SIZE, fix it in src/config.ts — do not hardcode at call sites).
- Keep the change minimal, correct, and idiomatic to the existing code.

Verify: run \`npx vitest run ${diag.failingTestFile}\` and confirm the previously failing test(s) pass, and run \`npx tsc --noEmit\` (with noEmit there should be no errors once fixed). A few concurrent vitest invocations may run; still report honestly what you observed.

Report: file (the src file you changed), changeSummary, diffHint (before->after of each change, one line each), targetTestNowPasses (boolean), and a short tail of the test output.`
}

function verifyPrompt(fix, diag, round) {
  return `You are an INDEPENDENT ADVERSARIAL VERIFIER (round ${round}) in the repo at ${REPO}. A fix agent reported changing source to make a test pass. It is your job to challenge that claim — assume the fix may be a hack, a symptom-mask, or scope creep until proven otherwise.

Fix agent report:
- Changed file: ${fix.file}
- Summary: ${fix.changeSummary}
- Diff hint: ${fix.diffHint}
- Claims target test passes: ${fix.targetTestNowPasses}
- Failing test it targets: ${diag.failingTestFile} :: ${diag.failingTestNames.join(', ')}
- Diagnosed root cause (for reference): ${diag.rootCause}

Verify:
1. Run \`git status\` and \`git diff -- ${fix.file}\` to read the actual diff. Also check \`git diff --stat\` and \`git status --porcelain\` — there must be NO changes under tests/.
2. Re-read the test file ${diag.failingTestFile} and extract the true test intent (spec comments in the module, assertions used, edge cases implied).
3. Run \`npx vitest run ${diag.failingTestFile}\` and \`npx tsc --noEmit\` to observe real behavior.
4. Judge adversarially:
   - Does the change fix the REAL root cause (produces correct behavior for the whole contract, not just the one assertion)?
   - Is it minimal, or does it add unrelated changes / dead code / hardcoded outputs that happen to satisfy this test?
   - Did it weaken or bypass any assertion or edit tests/?
   - Would the module's documented spec (comments like ORD-88 / OPS-31 / FIN-19 / RET-7 / OPS-12) be honored in edge cases the test does not cover?

Return verdict: "CORRECT" (genuine root-cause fix, intent preserved), "PARTIAL" (fixes the specific case but fragile / misses the spec), or "WRONG" (does not fix the root cause or papers over it). isRealFix = true ONLY for a genuine root-cause fix meeting the module's contract. testIntentPreserved = whether test assertions/intent were left intact. Provide concrete notes referencing lines you inspected. Do NOT edit any files.`
}

const MAX_ROUNDS = 6
const allDiags = []
const allFixes = []
const allVerdicts = []
let round = 1
let prevKeys = null
let noProgressStreak = 0
let stoppedEarlyReason = null
let finalStatus = null

phase('Status')
finalStatus = await agent(statusPrompt(round), { schema: STATUS_SCHEMA, label: `status:round${round}`, phase: 'Status' })

while (round <= MAX_ROUNDS) {
  if (!finalStatus) {
    phase('Status')
    finalStatus = await agent(statusPrompt(round), { schema: STATUS_SCHEMA, label: `status:round${round}`, phase: 'Status' })
  }

  if (finalStatus.testsPass && finalStatus.tscPass) {
    log(`Round ${round}: ALL GREEN — npm test passes and tsc --noEmit is clean`)
    break
  }

  const keys = failureKeys(finalStatus)
  const madeProgress = prevKeys === null || !keysEqual(keys, prevKeys)
  if (!madeProgress) noProgressStreak += 1
  else noProgressStreak = 0

  if (noProgressStreak >= 2) {
    stoppedEarlyReason = `no progress for ${noProgressStreak} consecutive rounds (same ${keys.length} failing issue(s))`
    log(`Round ${round}: ${stoppedEarlyReason} — stopping early per stop condition`)
    break
  }
  prevKeys = keys
  log(`Round ${round}: ${keys.length} issue(s) — tests=${finalStatus.testsPass ? 'ok' : 'FAILING'}, tsc=${finalStatus.tscPass ? 'ok' : 'ERR'}`)

  // Phase: Diagnose (parallel, one agent per failing test file)
  phase('Diagnose')
  const byFile = new Map()
  for (const ft of finalStatus.failingTests || []) {
    if (!byFile.has(ft.file)) byFile.set(ft.file, [])
    byFile.get(ft.file).push(ft.name)
  }
  const files = [...byFile.keys()]
  const diags = (await parallel(
    files.map((file) => () =>
      agent(diagnosePrompt(file, byFile.get(file), round, finalStatus), {
        schema: DIAGNOSIS_SCHEMA,
        label: `diagnose:${base(file)}`,
        phase: 'Diagnose',
      })
    )
  )).filter(Boolean)
  allDiags.push(...diags.map((d) => ({ round, ...d })))
  if (!diags.length) {
    stoppedEarlyReason = 'diagnosis produced no root causes'
    log('Round: no diagnoses returned — can make no progress')
    break
  }

  // Phase: Fix (one fix agent per suspected root cause, parallel; each edits a distinct src/ file)
  phase('Fix')
  const fixes = (await parallel(
    diags.map((d) => () =>
      agent(fixPrompt(d, round), {
        schema: FIX_SCHEMA,
        label: `fix:${base(d.affectedFile)}`,
        phase: 'Fix',
      })
    )
  )).filter(Boolean)
  allFixes.push(...fixes.map((f) => ({ round, ...f })))

  // Phase: Verify (independent adversarial verifier per fix, parallel)
  phase('Verify')
  const verdicts = (await parallel(
    fixes.map((fix) => () => {
      const diag = diags.find((d) => d.affectedFile === fix.file) || { failingTestFile: 'unknown', failingTestNames: [], rootCause: 'n/a' }
      return agent(verifyPrompt(fix, diag, round), {
        schema: VERDICT_SCHEMA,
        label: `verify:${base(fix.file)}`,
        phase: 'Verify',
      })
    })
  )).filter(Boolean)
  allVerdicts.push(...verdicts.map((v) => ({ round, ...v })))

  const flagged = verdicts.filter((v) => v.verdict !== 'CORRECT')
  if (flagged.length) {
    log(`Verify round ${round}: ${flagged.length} of ${verdicts.length} fix(es) flagged as ${flagged.map((v) => v.verdict).join(', ')} — will re-diagnose`)
  }

  round += 1

  // Phase: Gate (fresh status check to close the loop)
  phase('Status')
  finalStatus = await agent(statusPrompt(round), { schema: STATUS_SCHEMA, label: `status:round${round}`, phase: 'Status' })
}

if (finalStatus && !(finalStatus.testsPass && finalStatus.tscPass) && round > MAX_ROUNDS) {
  stoppedEarlyReason = `reached safety cap of ${MAX_ROUNDS} rounds`
}

return {
  allGreen: !!(finalStatus && finalStatus.testsPass && finalStatus.tscPass),
  roundsCompleted: round,
  stoppedEarlyReason,
  finalStatus: finalStatus
    ? {
        testsPass: finalStatus.testsPass,
        tscPass: finalStatus.tscPass,
        failingTests: finalStatus.failingTests,
        tscErrors: finalStatus.tscErrors,
      }
    : null,
  diagnostics: allDiags.map((d) => ({
    round: d.round,
    failingTestFile: d.failingTestFile,
    failingTestNames: d.failingTestNames,
    affectedFile: d.affectedFile,
    rootCause: d.rootCause,
    fixApproach: d.fixApproach,
  })),
  fixes: allFixes.map((f) => ({
    round: f.round,
    file: f.file,
    changeSummary: f.changeSummary,
    diffHint: f.diffHint,
    targetTestNowPasses: f.targetTestNowPasses,
  })),
  verdicts: allVerdicts.map((v) => ({
    round: v.round,
    verdict: v.verdict,
    isRealFix: v.isRealFix,
    testIntentPreserved: v.testIntentPreserved,
    notes: v.notes,
  })),
}