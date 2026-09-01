export const meta = {
  name: 'fix-exp2-failing-tests',
  description: 'Diagnose planted bugs in parallel, apply one fix per root cause, adversarially verify each, loop until npm test and tsc are clean',
  phases: [
    { title: 'Check status' },
    { title: 'Diagnose' },
    { title: 'Fix' },
    { title: 'Verify' },
  ],
}

const AREAS = [
  { area: 'batching', testFile: 'tests/batching.test.ts', srcCandidates: ['src/config.ts', 'src/batching.ts'] },
  { area: 'dates', testFile: 'tests/dates.test.ts', srcCandidates: ['src/dates.ts'] },
  { area: 'money', testFile: 'tests/money.test.ts', srcCandidates: ['src/money.ts'] },
  { area: 'refunds', testFile: 'tests/refunds.test.ts', srcCandidates: ['src/refunds.ts'] },
  { area: 'retry', testFile: 'tests/retry.test.ts', srcCandidates: ['src/retry.ts'] },
  { area: 'sorting', testFile: 'tests/sorting.test.ts', srcCandidates: ['src/sorting.ts'] },
]

const areaByTestFile = Object.fromEntries(AREAS.map((a) => [a.testFile, a.area]))
const areaBySrcFile = Object.fromEntries(AREAS.flatMap((a) => a.srcCandidates.map((f) => [f, a.area])))

function areaForFile(raw) {
  if (!raw) return null
  const norm = String(raw).replace(/\\/g, '/')
  if (areaByTestFile[norm]) return areaByTestFile[norm]
  if (areaBySrcFile[norm]) return areaBySrcFile[norm]
  const base = norm.split('/').pop()
  for (const a of AREAS) {
    if (a.testFile.split('/').pop() === base) return a.area
    if (a.srcCandidates.map((s) => s.split('/').pop()).includes(base)) return a.area
  }
  return null
}

const STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['testsPass', 'typecheckClean', 'failingTestFiles', 'failingTestNames', 'tscErrors', 'summary'],
  properties: {
    testsPass: { type: 'boolean' },
    typecheckClean: { type: 'boolean' },
    failingTestFiles: { type: 'array', items: { type: 'string' } },
    failingTestNames: { type: 'array', items: { type: 'string' } },
    tscErrors: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rootCause', 'expectedBehavior', 'srcFileToChange'],
  properties: {
    rootCause: { type: 'string' },
    expectedBehavior: { type: 'string' },
    srcFileToChange: { type: 'string' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['filesChanged', 'diff', 'targetedTestPasses', 'notes'],
  properties: {
    filesChanged: { type: 'array', items: { type: 'string' } },
    diff: { type: 'string' },
    targetedTestPasses: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasons', 'concerns'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted'] },
    reasons: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
  },
}

const statusPrompt = `Check the health of the test suite and the typecheck in this TypeScript repo. You are at the repository root: C:/codeagent/dynamic-workflows-lab/fixtures/exp2-fix (Windows machine; Git Bash or PowerShell both work; npm test runs vitest, npx tsc --noEmit typechecks).

Run these two commands and capture output AND exit codes (capture exit codes explicitly, e.g. run 'npm test; echo NPM_EXIT=$?' in bash or 'npm test; echo "NPM_EXIT=$LASTEXITCODE"' in PowerShell; do not let a pipe swallow the exit code):

Command 1: npm test
Command 2: npx tsc --noEmit

Interpret the real output:
- testsPass = true iff npm test finished with zero failing tests (check the summary line like 'Tests  6 failed | 6 passed' and the exit code). 0 failed is the only passing condition.
- typecheckClean = true iff tsc printed no lines matching 'error TS...'.
- failingTestFiles: relative paths (e.g. 'tests/money.test.ts') for every test FILE with at least one failing test. Empty array if all pass.
- failingTestNames: human labels of failing tests if readable (e.g. 'money > rounds discounts to whole cents, half-up (FIN-19)').
- tscErrors: each tsc error line verbatim (e.g. 'src/refunds.ts(7,5): error TS2353: ...'). Empty array if clean.
- summary: one line summarizing counts, e.g. '6 failed, 6 passed' and/or '1 tsc error'.

Be accurate: read the actual command output; do not guess or assume. Return JSON per schema.`

function diagnosisPrompt(area) {
  return `Diagnose why a Vitest test is failing in a TypeScript repo. You are at the repository root: C:/codeagent/dynamic-workflows-lab/fixtures/exp2-fix (Windows; Git Bash or PowerShell both work; 'npm test' runs vitest, 'npx tsc --noEmit' typechecks).

Focus area: ${area.area}
Failing test file: ${area.testFile}
Candidate source files: ${area.srcCandidates.join(', ')}

Steps:
1. Read the test file and the candidate source files, plus any module the source imports values from (e.g. constants in src/config.ts).
2. Run the targeted test to see the failure: npx vitest run ${area.testFile}
3. Identify the ROOT CAUSE in the SOURCE code: the precise wrong constant / wrong branch / missing behaviour that makes the assertions fail. Consider ALL assertions in the test file - the eventual fix must satisfy the whole test intent (input immutability, exact rounding, ordering, exact error messages, attempt counts), not just the first failing line.
4. Decide which src file must be edited. It may be a file imported by the candidates (e.g. a constant in src/config.ts).

Hard constraints: DO NOT modify any files. Never suggest changing or weakening tests. This is a read-only diagnostic pass.

Return JSON with:
- rootCause: one precise sentence describing the defect in the source
- expectedBehavior: what the code must do to satisfy every assertion
- srcFileToChange: the relative path of the file to edit, e.g. 'src/config.ts'`
}

function fixPrompt(ctx, d) {
  return `Fix a bug in a TypeScript repo. You are at the repository root: C:/codeagent/dynamic-workflows-lab/fixtures/exp2-fix (Windows; Git Bash or PowerShell both work; 'npm test' runs vitest, 'npx tsc --noEmit' typechecks).

Area: ${ctx.area}
Asserting test file: ${ctx.testFile}

Independent diagnosis:
- Root cause: ${d.rootCause}
- Expected behavior: ${d.expectedBehavior}
- File to change: ${d.srcFileToChange}

Apply a MINIMAL, surgical fix to ${d.srcFileToChange} that resolves the root cause and satisfies EVERY assertion in the test file. Constraints:
- Only modify files under src/. NEVER touch anything under tests/.
- Do not weaken or delete assertions. Do not change public function signatures unless a type error forces it.
- No refactors, no unrelated changes, no scope creep. Match existing style and comments.
- The repo uses src/config.ts constants as a single source of truth - prefer fixing the constant there over hardcoding values at call sites.
- Think about the exact math: e.g. 'half-up rounding of the final whole-cent amount' means round the RESULT (cents * (100 - percentOff) / 100), not each subtraction term separately.

After editing, verify yourself by running:
1. npx vitest run ${ctx.testFile}   (must pass - run it and check)
2. npx tsc --noEmit   (must be clean for any file you changed; fix errors you introduced)

Return JSON:
- filesChanged: relative paths you edited
- diff: the exact before/after of your code changes
- targetedTestPasses: whether npx vitest run ${ctx.testFile} passed
- notes: caveats (e.g. pre-existing unrelated tsc errors you left alone)`
}

function verifyPrompt(ctx, d, f) {
  return `You are an independent ADVERSARIAL VERIFIER. A fix agent claims to have fixed a failing Vitest test. Your job is to try to REFUTE the fix; only confirm it if it genuinely satisfies the full test intent with a minimal, safe diff.

Repo root: C:/codeagent/dynamic-workflows-lab/fixtures/exp2-fix (Windows; Git Bash or PowerShell; 'npm test' = vitest, 'npx tsc --noEmit' typechecks).

Area: ${ctx.area}
Test file: ${ctx.testFile}
Claimed root cause: ${d.rootCause}
Fix agent report (the on-disk diff is authoritative, not this text):
${JSON.stringify(f, null, 2)}

Steps:
1. Read ${ctx.testFile} and the changed source files. Run 'git diff' and 'git status' to see the EXACT current changes on disk vs baseline. Base your verdict on what is actually on disk.
2. Verify against FULL TEST INTENT: re-derive every assertion's expected value and confirm the change satisfies ALL of them, not just the original failing one. Watch for hidden expectations: order preservation, input immutability, half-up rounding of the correct intermediate value, exact error messages, exact attempt counts.
3. Check the diff for harm: tests modified or weakened, unrelated files touched, code deleted, public API changed unnecessarily, new edge-case regressions.
4. Run the targeted test yourself to confirm the result: npx vitest run ${ctx.testFile}
5. Run 'npx tsc --noEmit' if you suspect any type problem in the changed file.

Only refute on concrete, reproducible problems. Style nitpicks are not refutations.

Return JSON:
- verdict: 'confirmed' or 'refuted'
- reasons: concrete evidence for the verdict
- concerns: non-blocking notes (may be empty)`
}

let success = false
let rounds = 0
let maxRounds = 8
const state = {}
const seenSets = []
let noProgress = 0

while (true) {
  rounds++
  phase('Check status')
  log('Round ' + rounds + ': checking npm test + tsc')
  const status = await agent(statusPrompt, { schema: STATUS_SCHEMA, label: 'status:r' + rounds, phase: 'Check status', effort: 'medium' })
  log('Round ' + rounds + ' status: ' + status.summary)
  if (status.testsPass && status.typecheckClean) {
    success = true
    log('Round ' + rounds + ': all tests pass AND typecheck is clean. Done.')
    break
  }

  const failingAreas = []
  const addArea = (a) => { if (a && !failingAreas.includes(a)) failingAreas.push(a) }
  for (const t of status.failingTestFiles || []) addArea(areaForFile(t))
  for (const e of status.tscErrors || []) {
    const m = /src[\/\\][A-Za-z0-9_.\-\/\\]+?\.(?:ts|tsx|js|jsx)/.exec(String(e))
    if (m) addArea(areaForFile(m[0].replace(/\\/g, '/')))
  }

  const setKey = failingAreas.slice().sort().join('|')
  if (seenSets.length && setKey === seenSets[seenSets.length - 1]) noProgress++
  else noProgress = 0
  seenSets.push(setKey)

  if (failingAreas.length === 0) {
    log('Suite still failing but no mapped areas: ' + status.summary + '. Stopping to avoid divergence.')
    break
  }
  if (noProgress >= 2) {
    log('Two consecutive rounds with no progress on failing areas (' + setKey + '). Stopping early.')
    break
  }
  if (rounds >= maxRounds) {
    log('Reached maxRounds safety cap (' + maxRounds + '). Stopping.')
    break
  }

  log('Round ' + rounds + ': working on areas -> ' + failingAreas.join(', '))
  const results = await pipeline(
    failingAreas,
    (area) => {
      if (state[area] && state[area].diagnosis) return { area, diagnosis: state[area].diagnosis }
      return agent(diagnosisPrompt(AREAS.find((a) => a.area === area)), { schema: DIAGNOSIS_SCHEMA, label: 'diag:' + area, phase: 'Diagnose', effort: 'high' })
        .then((dl) => ({ area, diagnosis: dl }))
    },
    ({ area, diagnosis }) => {
      const d = (state[area] && state[area].diagnosis) || diagnosis
      return agent(fixPrompt(AREAS.find((a) => a.area === area), d), { schema: FIX_SCHEMA, label: 'fix:' + area, phase: 'Fix', effort: 'high' })
        .then((fx) => ({ area, diagnosis: d, fix: fx }))
    },
    ({ area, diagnosis, fix }) => {
      return agent(verifyPrompt(AREAS.find((a) => a.area === area), diagnosis, fix), { schema: VERIFY_SCHEMA, label: 'verify:' + area, phase: 'Verify', effort: 'high' })
        .then((v) => ({ area, diagnosis, fix, verify: v }))
    }
  )
  for (const r of (results || []).filter(Boolean)) {
    state[r.area] = { diagnosis: r.diagnosis, fix: r.fix, verify: r.verify }
  }
  log('Round ' + rounds + ' verdicts: ' + Object.keys(state).map((k) => k + '=' + (state[k].verify ? state[k].verify.verdict : 'n/a')).join(', '))
}

const final = {
  success,
  rounds,
  failingAreasAtEnd: seenSets.length ? seenSets[seenSets.length - 1] : '',
  areas: AREAS.map((a) => {
    const s = state[a.area]
    return {
      area: a.area,
      testFile: a.testFile,
      rootCause: s && s.diagnosis ? s.diagnosis.rootCause : null,
      expectedBehavior: s && s.diagnosis ? s.diagnosis.expectedBehavior : null,
      filesChanged: s && s.fix ? s.fix.filesChanged : null,
      diff: s && s.fix ? s.fix.diff : null,
      fixNotes: s && s.fix ? s.fix.notes : null,
      verifierVerdict: s && s.verify ? s.verify.verdict : null,
      verifierReasons: s && s.verify ? s.verify.reasons : null,
    }
  }),
}
return final