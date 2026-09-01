export const meta = {
  name: 'exp2-fix-loop',
  description: 'Diagnose failing tests in parallel, fix each root cause, adversarially verify each fix, loop until npm test + tsc are green',
  phases: [
    { title: 'Check', detail: 'run npm test + npx tsc --noEmit' },
    { title: 'Diagnose', detail: 'one agent per failing test file' },
    { title: 'Fix', detail: 'one agent per root cause' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
  ],
}

const REPO = 'C:/codeagent/dynamic-workflows-lab/fixtures/exp2-fix'

const CHECK_SCHEMA = {
  type: 'object',
  required: ['testsPass', 'tscClean', 'failingTestFiles', 'summary'],
  properties: {
    testsPass: { type: 'boolean' },
    tscClean: { type: 'boolean' },
    failingTestFiles: { type: 'array', items: { type: 'string' }, description: 'Paths like tests/batching.test.ts for every file containing a failing test; empty array if all pass' },
    summary: { type: 'string' },
  },
}

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  required: ['area', 'srcFile', 'testFile', 'rootCause', 'proposedChange'],
  properties: {
    area: { type: 'string' },
    srcFile: { type: 'string' },
    testFile: { type: 'string' },
    rootCause: { type: 'string', description: 'The single precise defect in src/ that makes the test fail (root cause, not symptom)' },
    proposedChange: { type: 'string', description: 'Exact minimal edit: current code snippet -> corrected code snippet' },
  },
}

const FIX_REPORT_SCHEMA = {
  type: 'object',
  required: ['area', 'changeSummary', 'diff', 'failingTestPasses', 'guardTestsPass', 'vitestOutput'],
  properties: {
    area: { type: 'string' },
    changeSummary: { type: 'string', description: 'One sentence: what changed and why it fixes the root cause' },
    diff: { type: 'string', description: 'git diff output for the edited src file after your change' },
    failingTestPasses: { type: 'boolean' },
    guardTestsPass: { type: 'boolean' },
    vitestOutput: { type: 'string', description: 'last ~15 lines of vitest run output, or note if shell unavailable' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['area', 'verdict', 'rootCauseAddressed', 'testsIntentSatisfied', 'testsUntouched', 'minimal', 'comments'],
  properties: {
    area: { type: 'string' },
    verdict: { type: 'string', enum: ['correct', 'problematic'] },
    rootCauseAddressed: { type: 'boolean' },
    testsIntentSatisfied: { type: 'boolean' },
    testsUntouched: { type: 'boolean' },
    minimal: { type: 'boolean' },
    comments: { type: 'string' },
  },
}

function deriveAreas(paths) {
  const out = []
  for (const p of paths || []) {
    if (!p) continue
    const base = String(p).split(/[\\/]/).pop() || ''
    const name = base.replace(/\.test\.ts$/, '').replace(/\.ts$/, '')
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

const CHECK_PROMPT = `You are the CI gate for a TypeScript repo. The repo root is ${REPO} (on Windows; if you run bash, cd to it first, e.g. cd /c/codeagent/dynamic-workflows-lab/fixtures/exp2-fix).

Run these two commands from the repo root. Do NOT modify any files — only observe and report.
1) npm test
2) npx tsc --noEmit

Report via the schema:
- testsPass: whether the vitest suite fully passed (exit 0, no failing tests).
- tscClean: whether tsc exited 0 with no error output.
- failingTestFiles: the repo-relative path (e.g. "tests/batching.test.ts") of every test file containing at least one failing test. Empty array if everything passes.
- summary: one or two lines quoting vitest totals (e.g. "6 failed | 6 passed") and any tsc errors verbatim, plus the list of failing test files.`

function diagnosePrompt(area) {
  return `You are diagnosing a failing test in a TypeScript repo. Repo root: ${REPO}.

Test file: ${REPO}/tests/${area}.test.ts
Source file: ${REPO}/src/${area}.ts

Steps:
1. Read BOTH files fully (use Read with the absolute paths above).
2. Read the failing test's name and assertions carefully — they encode the intended behavior. The test is the contract; do NOT propose any change to it.
3. Find the ROOT CAUSE in src/${area}.ts: the single precise defect that makes the test fail (e.g. wrong constant, missing +1 on a zero-based value, wrong object property name, wrong comparator, missing throw on retry exhaustion, missing money rounding, etc.).
4. Only report a defect fixable entirely in src/ and minimal. Do not propose new abstractions, signature changes, renamed exports, or new helper files.
5. If a constant from src/config.ts is involved, note that config.ts is the single source of truth — the fix must change the constant there, never hardcode the value at the call site.
6. Return existing schemas as-is; do NOT invent ticket names or behave as if you know the answer beforehand — reason from the code and the test assertions.

Return the DIAGNOSIS_SCHEMA object: with rootCause (one tight paragraph) and proposedChange (exact current snippet -> corrected snippet). Do NOT edit any files.`
}

function fixPrompt(d) {
  return `You are a fix agent in a TypeScript repo. Repo root: ${REPO}.

Area: ${d.area}
Diagnosed root cause: ${d.rootCause}
Diagnosed proposed change: ${d.proposedChange}

Task:
1. Read ${REPO}/src/${d.area}.ts and ${REPO}/tests/${d.area}.test.ts fully (absolute paths; Read each before editing).
2. Sanity-check the diagnosis against the test's actual assertions. You are responsible for making the test pass at its ROOT. If the proposed change is wrong, incomplete, games the assertion, or hardcodes an expected value — correct course yourself before editing. The test file and its assertions are the contract.
3. Apply the MINIMAL edit to src/${d.area}.ts only (use Edit on ${REPO}/src/${d.area}.ts). Hard rules:
   - NEVER modify anything under tests/.
   - NEVER weaken, remove, or change assertions.
   - Do not change exported signatures or unrelated behavior; no reformatting, no debug leftovers.
   - If the relevant constant lives in src/config.ts, edit src/config.ts instead of hardcoding at the call site.
4. Verify by running (bash): cd /c/codeagent/dynamic-workflows-lab/fixtures/exp2-fix && npx vitest run tests/${d.area}.test.ts
   The previously-failing test must now pass AND every other test in that file must still pass. If a shell/bash tool is unavailable, say so in vitestOutput and rely on careful reading.
5. Capture the exact change with: git diff -- src/${d.area}.ts

Return the FIX_REPORT_SCHEMA object.`
}

function verifyPrompt(f) {
  return `You are an INDEPENDENT ADVERSARIAL VERIFIER in a TypeScript repo. Repo root: ${REPO}. Your job is to TRY TO CONDEMN a fix, not rubber-stamp it.

A fix agent reports for area ${f.area}:
Change summary: ${f.changeSummary}
Diff: ${f.diff ? f.diff : '(not provided — inspect with git diff yourself)'}

Steps:
1. Run (bash, from repo root): git status and git diff --stat, then git diff
   Confirm the ONLY changed file is src/${f.area}.ts (or src/config.ts if that was the legitimate fix site, plus any legitimately related src file). NOTHING under tests/ may be modified — if any test file changed, that is an automatic 'problematic'.
2. Read ${REPO}/tests/${f.area}.test.ts and ${REPO}/src/${f.area}.ts in full.
3. Adversarial checks:
   a. TEST INTENT: does the change satisfy the semantic INTENT of the failing test (compute the real behavior), or does it game/bypass the assertion (hardcode an expected literal, return a constant, default output)? Reject games.
   b. ROOT CAUSE: does it fix the root cause such that ADJACENT valid inputs still behave correctly (different order timestamps, a different discount percentage, a different batch size / id count, a different ISO date, a different retry failure count)?
   c. MINIMAL: any unrelated edits, reformatting, dead code, or debug leftovers?
   d. NO WEAKENING: confirm the test assertions are byte-for-byte unchanged (tests/ diff must be empty).
4. Run (bash): npx vitest run tests/${f.area}.test.ts — all tests in the file must pass. If you cannot run shell commands, rely on careful reading and say so in comments.
5. If the change involves a config value, it must read it from src/config.ts, not duplicate the literal.

Be harsh: only 'correct' if ALL checks pass. If anything concrete fails, verdict must be 'problematic' with specifics.

Return the VERDICT_SCHEMA object.`
}

let lastDiagnoses = []
let lastFixes = []
let lastVerdicts = []
let finalStatus = 'no-rounds'
const rounds = []
let prevKey = null
let noProgress = 0

for (let round = 1; round <= 6; round++) {
  const check = await agent(CHECK_PROMPT, { label: `check:r${round}`, phase: 'Check', schema: CHECK_SCHEMA })
  if (!check) {
    log(`Round ${round}: CI check agent failed; retrying next round`)
    rounds.push({ round, status: 'check-failed' })
    continue
  }
  const fails = check.failingTestFiles || []
  const key = fails.slice().sort().join('|')
  log(`Round ${round}: testsPass=${check.testsPass} tscClean=${check.tscClean} failingFiles=${fails.length}`)

  if (check.testsPass && check.tscClean) {
    finalStatus = 'green'
    rounds.push({ round, status: 'green', check })
    break
  }
  if (round > 1 && key === prevKey) {
    noProgress++
  } else if (round > 1) {
    noProgress = 0
  }
  if (noProgress >= 2) {
    finalStatus = 'stuck'
    log(`Round ${round}: two consecutive rounds with no progress (failing set unchanged: ${key}). Stopping early.`)
    rounds.push({ round, status: 'stuck', check })
    break
  }
  prevKey = key

  const areas = deriveAreas(fails)
  log(`Round ${round}: diagnosing areas [${areas.join(', ')}]`)

  const diagnoses = await parallel(areas.map((area) => () =>
    agent(diagnosePrompt(area), { label: `diag:${area}`, phase: 'Diagnose', schema: DIAGNOSIS_SCHEMA })))
  const validDiagnoses = diagnoses.filter(Boolean)
  lastDiagnoses = validDiagnoses

  const fixes = await parallel(validDiagnoses.map((d) => () =>
    agent(fixPrompt(d), { label: `fix:${d.area}`, phase: 'Fix', schema: FIX_REPORT_SCHEMA })))
  const validFixes = fixes.filter(Boolean)
  lastFixes = validFixes

  const verdicts = await parallel(validFixes.map((fx) => () =>
    agent(verifyPrompt(fx), { label: `verify:${fx.area}`, phase: 'Verify', schema: VERDICT_SCHEMA })))
  lastVerdicts = verdicts.filter(Boolean)

  const bad = lastVerdicts.filter((v) => v.verdict === 'problematic')
  log(`Round ${round}: fixes=${validFixes.length}, verdicts correct=${validFixes.length - bad.length}, problematic=${bad.length}`)
  rounds.push({ round, status: 'round-done', check, areas, badAreas: bad.map((b) => b.area) })
}

return {
  finalStatus,
  loops: rounds.length,
  roundLog: rounds.map((r) => ({
    round: r.round,
    status: r.status,
    failingFiles: ((r.check && r.check.failingTestFiles) || []).length,
    areas: r.areas || [],
    badAreas: r.badAreas || [],
  })),
  diagnoses: lastDiagnoses.map((d) => ({ area: d.area, rootCause: d.rootCause, proposedChange: d.proposedChange })),
  fixes: lastFixes.map((fx) => ({ area: fx.area, changeSummary: fx.changeSummary, diff: fx.diff })),
  verdicts: lastVerdicts.map((v) => ({ area: v.area, verdict: v.verdict, comments: v.comments })),
}