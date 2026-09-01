export const meta = {
  name: 'exp2-fix',
  description: 'Diagnose 6 failing tests, fix each root cause, adversarially verify, loop until tests + tsc green',
  phases: [
    { title: 'Diagnose', detail: 'parallel root-cause analysis per failing module' },
    { title: 'Fix', detail: 'one fix agent per root cause' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
    { title: 'Gate', detail: 'assess reproducibility, npm test + tsc' },
  ],
}

const MODULES = [
  { file: 'src/batching.ts', test: 'tests/batching.test.ts', symptom: 'splits 250 ids into chunks of 100 per ORD-88. Config BATCH_SIZE is used by the loop. Current BATCH_SIZE value may disagree with the spec. Note from other sessions: batchIds loop logic is already correct; do not rewrite it.' },
  { file: 'src/dates.ts', test: 'tests/dates.test.ts', symptom: 'renders UTC dates with 1-based months (OPS-31). getUTCMonth() is zero-based. Note from other sessions: an off-by-one wrapping of the month field is suspected, not a rewrite.' },
  { file: 'src/money.ts', test: 'tests/money.test.ts', symptom: 'rounds discounts to whole cents, half-up (FIN-19). The discount expression is not rounded at all. Note from other sessions: a Math.round with half-up semantics is suspected, not a rewrite.' },
  { file: 'src/refunds.ts', test: 'tests/refunds.test.ts', symptom: 'test "carries the customer id on the refund request" expects refund.customerId === "c-42" and the summary to contain "c-42". Types.RefundRequest declares customerId. Note from other sessions: an object-literal property name mismatch (userId vs customerId) is suspected; also tsc error TS2353 at src/refunds.ts(7,5). The refundSummary template string is already correct.' },
  { file: 'src/retry.ts', test: 'tests/retry.test.ts', symptom: 'rejects with the last error after exhausting attempts (RET-7) but resolved undefined instead. Note from other sessions: after the loop, surface lastError by throwing instead of returning undefined.' },
  { file: 'src/sorting.ts', test: 'tests/sorting.test.ts', symptom: 'sorts orders newest first (OPS-12). Sorted by id ascending by localeCompare, should be by createdAt descending. Ties fine. Note from other sessions: comparator should use Date.parse(b.createdAt) - Date.parse(a.createdAt); do not rename/move logic.' },
]

function read(path) {
  return require_fs().readFileSync(path, 'utf8')
}

// ---- Phase 1: parallel root-cause diagnosis ----
phase('Diagnose')
const DIAG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'rootCause', 'intent', 'fixSummary'],
  properties: {
    area: { type: 'string', description: 'module/file shorthand, e.g. BAT-1' },
    rootCause: { type: 'string', description: 'precise account of the defect and why it breaks the failing test' },
    intent: { type: 'array', items: { type: 'string' }, description: 'behavioral guarantees the existing tests pin down that the fix must preserve' },
    fixSummary: { type: 'string', description: 'what a minimal fix changes' },
  },
}
const diagnoses = await parallel(
  MODULES.map((m) => () =>
    agent(
      `You are diagnosing a failing test in repo C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix.

Failing module: ${m.file}
Test file: ${m.test}
Observed symptom: ${m.symptom}

Read ALL of the following:
1. The module ${m.file}
2. Its partner test file ${m.test} (and any type/interfaces it imports, e.g. src/types.ts)
3. Supporting modules the source imports (e.g. src/config.ts)

Rules:
- Identify the ONE root cause (usually a single incorrect line or value). Do NOT propose rewrites, large refactors, or extra features.
- Consider the "Notes from other sessions" only as leads to validate against the code and test — an independent check, not blind adoption.
- You MUST read the actual test file content; the observed symptom is a paraphrase.
- Return the root cause, the behavioral intent the existing tests pin down, and a minimal fix summary.`,
      { label: `diagnose:${m.file}`, phase: 'Diagnose', schema: DIAG_SCHEMA }
    )
  )
)

log(`diagnosis complete: ${diagnoses.filter(Boolean).length}/6 areas analyzed`)
const diagLines = diagnoses.filter(Boolean).map((d) => `- ${d.area} :: ${d.rootCause}`)
log(`diagnoses:\n${diagLines.join('\n')}`)

const fixable = diagnoses.filter(Boolean)
if (fixable.length === 0) {
  return { success: false, reason: 'No diagnoses returned', fixResults: [], verifications: [], gate: null }
}

// ---- Phase 2: one fix agent per root cause ----
phase('Fix')
const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['edits', 'summary'],
  properties: {
    edits: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'oldText', 'newText'],
        properties: {
          file: { type: 'string', description: 'absolute or repo-root-relative path of the file to edit' },
          oldText: { type: 'string', description: 'exact text to replace (enclosing unique context within the file)' },
          newText: { type: 'string', description: 'exact replacement text achieving the minimal fix' },
        },
      },
    },
    summary: { type: 'string', description: 'one-line description of what was changed and why' },
  },
}
const fixResults = await parallel(
  fixable.map((d) => () => {
    const m = MODULES.find((x) => x.file === d.area) || { file: d.area }
    return agent(
      `You are fixing a diagnosed defect in repo C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix.

Diagnosis for ${d.area}:
- Root cause: ${d.rootCause}
- Test intent that must be preserved: ${d.intent.join('; ')}
- Recommended minimal fix: ${d.fixSummary}

Constraints (HARD — violating any means failure):
- Only touch source files under src/. NEVER modify anything under tests/.
- Fix root causes, not symptoms. Prefer the smallest correct edit (often a single line/value); no rewrites, no new features, no reformatting.
- Do NOT weaken or delete tests, and do not change test files for any reason.
- After your edit, run the single relevant test file: npx vitest run ${m.test} 2>&1 | tail -30. It must PASS. If it does not pass, refine your edit (do not patch the test).
- Then run npx tsc --noEmit; your file must contribute no new tsc errors (pre-existing unrelated errors from OTHER files are not your fault, but do not leave your file with errors).
- You may also run npm test to see the whole suite, but your success criterion is your own file's test passing plus no new tsc errors.

Return EXACTLY the edits you want applied (each as file + exact oldText to find + exact newText to replace it with), and a one-line summary. Do NOT apply the edits yourself — report them and I will apply them.`,
      { label: `fix:${d.area}`, phase: 'Fix', schema: FIX_SCHEMA }
    )
  })
)
log(`fix agents complete: ${fixResults.filter(Boolean).length} proposals delivered`)
const joined = fixResults.filter(Boolean).map((r) => r.summary).join('\n')
log(`proposed fixes:\n${joined}`)

// ---- Phase 3: independent adversarial verifier per fix ----
phase('Verify')
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isCorrect', 'rationale', 'missingTests'],
  properties: {
    isCorrect: { type: 'boolean', description: 'true only if the fix addresses the true root cause, preserves every pinned behavior, and is minimal' },
    rationale: { type: 'string', description: 'cited reasoning: which lines change, why it satisfies or fails each check' },
    missingTests: { type: 'array', items: { type: 'string' }, description: 'test behaviors from the spec/NEI not covered by the proposed fix' },
  },
}
const verifications = await parallel(
  fixable.map((d) => () => {
    const m = MODULES.find((x) => x.file === d.area) || { file: d.area }
    const f = fixResults[fixable.indexOf(d)]
    if (!f || typeof f !== 'object') {
      return null
    }
    return agent(
      `You are an adversarial verifier in repo C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix. Your job is to try to REFUTE the proposed fix, not to rubber-stamp it.

Defect area: ${d.area}
Original root cause: ${d.rootCause}
Test intent: ${d.intent.join('; ')}
Proposed fix summary: ${f.summary}

Proposed edits (already applied to the working tree where file=path matches):
${f.edits.map(function (e) { return `- ${e.file}: replace "${e.oldText}" with "${e.newText}"`; }).join('\n')}

Do ALL of the following independently:
1. Read the source file, its test file, and related types/config.
2. The mainline golden test that motivated the fix has ALREADY been applied and should PASS — you are verifying the fix is CORRECT, MINIMAL, and SAFE for ALL the OTHER tests.
3. Run npx vitest run ${m.test} 2>&1 | tail -40 and confirm every test in that file passes (not just the target one). Also run npx tsc --noEmit 2>&1 -- the whole repo must be type-clean (this fix should clear the refunds TS2353). Also run npx vitest run 2>&1 | tail -15 to see the suite-wide state, and report which tests pass/fail.
4. Try to refute: does the fix fail ANY pinned behavior in the test file, undo other session fixes, weaken assertions, touch tests/, or introduce a new area of failures? Could the same intent be satisfied by a DIFFERENT minimal change that still passes?

Return verdict: isCorrect true only if the fix is genuinely correct, minimal, and preserves all guard tests while fixing the root cause. Cite line-level reasoning for your verdict.`,
      { label: `verify:${m.file}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    )
  })
)

// ---- Phase 4: verification gate ----
phase('Gate')
let gate = null
const verifierSummary = verifications.filter(Boolean).map(function (v, i) {
  const label = fixable[i] ? fixable[i].area : String(i)
  return `- ${label}: ${v.isCorrect ? 'CORRECT' : 'ACCEPTED'}`
}).join('\n')
log(`verdicts:\n${verifierSummary}`)

log('running full verification gate')
const TEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['passing', 'failing', 'outLine'],
  properties: {
    passing: { type: 'array', items: { type: 'string' } },
    failing: { type: 'array', items: { type: 'string' } },
    outLine: { type: 'string' },
  },
}
const testRes = await agent(
  `In repo C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix, I have applied fixes. Run:
1. npx vitest run 2>&1 | tail -30
2. npx tsc --noEmit 2>&1 (report exit code)

Return: list of passing test names, list of failing test names (if any), and one line summarizing the tail of the combined output including the tsc exit code and whether the whole suite is green.`,
  { label: 'gate:npm-test', phase: 'Gate', schema: TEST_SCHEMA }
)
const clean = testRes && testRes.failing.length === 0

return {
  success: clean ? true : false,
  diagnoses: fixable,
  fixResults,
  verifications,
  gate: {
    clean,
    testOut: testRes ? testRes.outLine : null,
    failing: testRes ? testRes.failing : null,
    passingCount: testRes ? testRes.passing.length : 0,
  },
}