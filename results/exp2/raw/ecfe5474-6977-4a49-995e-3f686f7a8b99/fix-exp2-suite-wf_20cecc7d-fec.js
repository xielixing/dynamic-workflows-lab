export const meta = {
  name: 'fix-exp2-suite',
  description: 'Parallel diagnose → fix → adversarial verify, loop to green for the exp2-fix vitest suite',
  phases: [
    { title: 'Diagnose', detail: 'parallel root-cause diagnosis per failing area' },
    { title: 'Fix', detail: 'one minimal root-cause fix agent per finding' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
    { title: 'Critique', detail: 'completeness critic over the whole working tree diff' },
  ],
}

const ctx = (args && args.context) || { round: 1, failingTests: [] }

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          area: { type: 'string', description: 'product area label, e.g. money' },
          file: { type: 'string', description: 'src-relative path of the file that must change' },
          rootCause: { type: 'string', description: 'precise description of the root-cause defect in src/' },
          spec: { type: 'string', description: 'the behavior the failing test demands, in your own words' },
          failingTest: { type: 'string', description: 'the failing test title' },
          testFile: { type: 'string', description: 'the test file that backstops this area' },
          expectedFixHint: { type: 'string', description: 'the minimal change you expect (which expression/constant/field)' },
        },
        required: ['area', 'file', 'rootCause', 'spec', 'failingTest', 'testFile', 'expectedFixHint'],
      },
    },
  },
  required: ['areas'],
}

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    file: { type: 'string', description: 'the single src/ file edited' },
    changeSummary: { type: 'string', description: 'exact before→after of the change' },
    rootCauseFixed: { type: 'string', description: 'one line: the root cause this addresses' },
    testTouched: { type: 'boolean', description: 'MUST be false' },
    otherFilesTouched: { type: 'array', items: { type: 'string' }, description: 'expect [] (or the config.ts path if you imported a value from it)' },
    passesAreaTest: { type: 'boolean', description: 'true only if you ran the area test file and all its tests passed' },
    appliedCleanly: { type: 'boolean', description: 'false only if you had to stop without a clean fix' },
    failureNote: { type: 'string' },
  },
  required: ['area', 'file', 'changeSummary', 'rootCauseFixed', 'testTouched', 'otherFilesTouched', 'passesAreaTest', 'appliedCleanly'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    file: { type: 'string' },
    verdict: { type: 'string', enum: ['CORRECT', 'PARTIAL', 'REFUTED'] },
    reason: { type: 'string', description: 'why you reached this verdict' },
    adversarialCases: { type: 'array', items: { type: 'string' }, description: 'edge cases checked and their outcomes' },
    problems: { type: 'array', items: { type: 'string' } },
    testsUntouched: { type: 'boolean' },
    assertionsWeakened: { type: 'boolean', description: 'true if any assertion/limit was loosened' },
    passesAreaTest: { type: 'boolean' },
  },
  required: ['area', 'file', 'verdict', 'reason', 'testsUntouched', 'assertionsWeakened', 'passesAreaTest'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['GREEN', 'ISSUES'] },
    issues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['verdict', 'issues'],
}

const AREAS = [
  { key: 'batching', src: ['src/batching.ts', 'src/config.ts'], test: 'tests/batching.test.ts', specTag: 'ORD-88', failure: 'expected [ 99, 99, 52 ] to deeply equal [ 100, 100, 50 ]' },
  { key: 'dates', src: ['src/dates.ts'], test: 'tests/dates.test.ts', specTag: 'OPS-31', failure: "expected '2026-02-08' to be '2026-03-08'" },
  { key: 'money', src: ['src/money.ts'], test: 'tests/money.test.ts', specTag: 'FIN-19', failure: 'expected 1699.15 to be 1699' },
  { key: 'refunds', src: ['src/refunds.ts', 'src/types.ts', 'src/money.ts'], test: 'tests/refunds.test.ts', specTag: 'n/a', failure: "expected undefined to be 'c-42'" },
  { key: 'retry', src: ['src/retry.ts'], test: 'tests/retry.test.ts', specTag: 'RET-7', failure: 'promise resolved "undefined" instead of rejecting' },
  { key: 'sorting', src: ['src/sorting.ts', 'src/types.ts'], test: 'tests/sorting.test.ts', specTag: 'OPS-12', failure: "expected [ 'o-1', 'o-2', 'o-3' ] to deeply equal [ 'o-2', 'o-3', 'o-1' ]" },
]

const failingLabel = (Array.isArray(ctx.failingTests) && ctx.failingTests.length)
  ? 'Currently failing tests in this round: ' + ctx.failingTests.map(function (t) { return '\n  - ' + t }).join('')
  : ''

function diagnosisPrompt(a) {
  return [
    'You are diagnosing ONE failing area of a vitest suite in a small TypeScript repo. Your cwd is the repo root. DO NOT MODIFY ANY FILE — diagnosis only.',
    '',
    'AREA: ' + a.key,
    'Relevant source files: ' + a.src.join(', '),
    'Test file (READ-ONLY): ' + a.test,
    'Observed failure message: ' + a.failure,
    '' + failingLabel,
    '',
    'Context: 6 tests are failing, one per area. Each failure is caused by a small, realistic root-cause bug deliberately planted in src/ (look for off-by-one, missing half-up rounding, zero-based month not +1, wrong field name, wrong comparator, wrong constant, swallowed retry error — real production-style code, never an impossible contract). A guard test in the same file passes.',
    '',
    'Tasks:',
    '1. Read the listed source file(s) and the test file carefully.',
    '2. If feasible run the failing test to confirm: npx vitest run ' + a.test + ' (run just that single file).',
    '3. Pinpoint the EXACT root cause in src/ (not the symptom) and the exact behavior the test demands.',
    '4. Decide which single file must change and which expression/constant/field is defective. If the bug is a constant, check src/config.ts — central config is the single source of truth and call sites must not hardcode values.',
    '5. If a src/ object literal uses a field the interface does not declare (a tsc error too), call it out explicitly — it is likely the root cause.',
    '',
    'Return the structured schema. Only report confirmed, code-level findings.',
  ].join('\n')
}

function fixPrompt(f) {
  return [
    'You are ONE of several parallel fix agents in the same repo (cwd = repo root). Apply EXACTLY ONE root-cause fix in EXACTLY ONE src/ file. Nothing else.',
    '',
    'Finding (independent diagnosis):',
    '- Area: ' + f.area,
    '- Root cause: ' + f.rootCause,
    '- Spec behavior required: ' + f.spec,
    '- File to change: ' + f.file,
    '- Test file (READ-ONLY, never modify or weaken): ' + f.testFile,
    '- Expected fix hint: ' + f.expectedFixHint,
    '',
    'Hard constraints (fixture rules):',
    '1. SMALLEST possible change — one expression/line/constant. No rewrites, no reformatting, no refactors, no new helpers or exports.',
    '2. NEVER touch anything under tests/ for any reason. Never weaken or remove assertions, never lower counts or loosen values.',
    '3. Edit no file other than the assigned one. Sole exception: if the fix requires a value that src/config.ts owns, import/use it from src/config.ts (single source of truth) instead of hardcoding.',
    '4. Keep every exported name and signature unchanged. Preserve the file\'s existing comment style and tone.',
    '5. Never run git checkout / git restore / git reset / git stash / git commit. Apply your edit directly with the Edit tool.',
    '',
    'Procedure:',
    '1. Read ' + f.file + ' and ' + f.testFile + '.',
    '2. Apply the minimal edit.',
    '3. Run ONLY the area test file and require it green: npx vitest run ' + f.testFile + '. The failing test plus the guard in that file must pass.',
    '4. If it does not pass, refine src/ (root cause) only. If the file cannot satisfy the test without touching tests, stop, appliedCleanly:false, and explain in failureNote.',
    '5. Check your changed code by eye for type errors. Do not run a full-project tsc (other agents edit other files concurrently and would corrupt the signal); do not report tsc results.',
    '',
    'Report via the schema: changeSummary (exact before→after), rootCauseFixed, testTouched:false, otherFilesTouched ([] or the config.ts path if you consumed a config value), passesAreaTest (truthful), appliedCleanly, failureNote.',
  ].join('\n')
}

function verifyPrompt(fix, f) {
  return [
    'You are an INDEPENDENT ADVERSARIAL VERIFIER of one claimed fix in a repo (cwd = repo root). Other agents may edit other files concurrently — inspect ONLY your target. DO NOT EDIT ANY FILE.',
    '',
    'The fix claim:',
    '- Area: ' + fix.area,
    '- File: ' + fix.file,
    '- Claimed change: ' + fix.changeSummary,
    '- Claimed root-cause fix: ' + fix.rootCauseFixed,
    '',
    'Independent context: the root cause for this area was diagnosed as: ' + f.rootCause + ' (test file: ' + f.testFile + ').',
    '',
    'Verify against (a) the test intent and (b) the actual diff, adversarially:',
    '',
    '1. DIFF — run: git diff HEAD -- ' + fix.file + '  (read the diff; if the path shows nothing, check `git status --porcelain` — the file may be untracked; inspect accordingly). Confirm the diff matches the claimed change, is MINIMAL, and fixes the root cause (not a symptom patch, not scope creep).',
    '2. TEST INTENT — read ' + f.testFile + '. State exactly what the failing test demands and confirm the diff delivers it without the test being edited.',
    '3. INTEGRITY (automatic REFUTED if violated):',
    '   - git status --porcelain tests/  → must be empty',
    '   - git diff HEAD -- tests/  → must be empty',
    '   - Tests must not be modified and no assertion may be weakened (no loosened counts/values/matches).',
    '4. ADVERSARIAL — fire at least 2-3 edge cases the spec should handle and reason through the fixed code for each. Shape yours to the area:',
    '   - money: half-cent (e.g. 333 @ 50% → 167), exact half (e.g. 25 @ 10%), larger values, 0% discount → unchanged.',
    '   - dates: Jan and Dec rollover, single-digit day 1-9 (padding), day 31 (month-length rollover behavior), already-passing guard.',
    '   - sorting: equal createdAt ties (stability/order), input array must stay unmutated, descending by time.',
    '   - retry: attempts=1 (reject with the single error), success on the FINAL attempt, error message carries the last attempt number.',
    '   - batching: exact multiple of BATCH_SIZE (no empty trailing batch, overflow 0), empty array (0 batches, overflow 0), remainder > 0. The constant must come from config (or be correct) — a constant change must not be smuggled into batching.ts.',
    '   - refunds: refund object field names must match the RefundRequest interface (customerId, not userId), refundSummary prefix format is exact.',
    '5. RUN the area test — npx vitest run ' + f.testFile + ' — both the failing test and the guard must pass. If the run fails, determine whether this fix is the cause or a concurrent edit in a DIFFERENT file by another agent is (read the failure output; report findings in problems either way).',
    '',
    'Return the verdict schema. Be skeptical but fair: minimal + intent-satisfying + adversarial-clean + tests untouched = CORRECT. Needs more work or a spec-visible edge case wrong = PARTIAL. Misses intent / touches tests / weakens assertions / symptom patch = REFUTED.',
  ].join('\n')
}

phase('Diagnose')
const diagResults = await parallel(
  AREAS.map(function (a) {
    return function () {
      return agent(diagnosisPrompt(a), { label: 'diag:' + a.key, phase: 'Diagnose', schema: FINDINGS_SCHEMA })
    }
  })
)
const findings = diagResults.filter(Boolean).flatMap(function (r) { return (r && r.areas) || [] }).filter(Boolean)
log('diagnosis complete: ' + findings.length + ' root-cause findings')
findings.forEach(function (f) { log('  found: ' + f.area + ' -> ' + f.file + ' (' + f.rootCause + ')') })

const appliedFixes = []
let verdicts = []
if (findings.length > 0) {
  verdicts = await pipeline(
    findings,
    function (f) {
      return agent(fixPrompt(f), { label: 'fix:' + f.area, phase: 'Fix', schema: FIX_SCHEMA }).then(function (fix) {
        if (fix) appliedFixes.push(fix)
        return fix
      })
    },
    function (fix, f) {
      if (!fix) return null
      return agent(verifyPrompt(fix, f), { label: 'verify:' + fix.area, phase: 'Verify', schema: VERDICT_SCHEMA })
    }
  )
}

phase('Critique')
const criticPrompt = [
  'You are a completeness critic reviewing the accumulated set of fixes in a repo (cwd = repo root). The fix and verify agents are done; the working tree now holds the full change set. DO NOT EDIT ANY FILE.',
  '',
  'Inspect:',
  '1. The complete source diff: git diff HEAD -- src/ (plus git status --porcelain for untracked new files).',
  '2. Every file under tests/ — read them all (READ-ONLY) to know the whole contract.',
  '3. Integrity: git status --porcelain and git diff HEAD -- tests/ must show NOTHING under tests/; no assertion weakened anywhere.',
  '4. Coverage: for every originally failing test below, confirm there is a source change addressing its root cause, with no symptom patches and no over-reach (unrelated edits):',
  (ctx.failingTests && ctx.failingTests.length ? ctx.failingTests.map(function (t) { return '   - ' + t }).join('\n') : '   - (no list provided; infer from the tests)'),
  '',
  '5. Verify no constant was smuggled to make a test pass (e.g., batch size or retry count lowered vs the spec) and that BATCH_SIZE and MAX_RETRIES live in src/config.ts (single source of truth) if used.',
  '6. Sanity-check the key behaviors in the diff: sorting is actually by createdAt descending (not id), dates add +1 to getUTCMonth, money rounds half-up to whole cents, retry throws the last error after exhausting attempts, refunds uses customerId, batching uses BATCH_SIZE from config.',
  '',
  'Return the schema: verdict GREEN (every root cause addressed minimally, tests untouched, no weakened assertions, tsc-clean by inspection) or ISSUES with each concrete issue.',
].join('\n')

const critic = await agent(criticPrompt, { label: 'critic', phase: 'Critique', schema: CRITIC_SCHEMA })

const cleanVerdicts = (verdicts || []).filter(Boolean)
return {
  round: ctx.round,
  findings: findings.map(function (f) { return { area: f.area, file: f.file, rootCause: f.rootCause } }),
  appliedFixes: appliedFixes.map(function (f) { return { area: f.area, file: f.file, change: f.changeSummary, testTouched: f.testTouched, otherFiles: f.otherFilesTouched, passesAreaTest: f.passesAreaTest } }),
  verdicts: cleanVerdicts.map(function (v) { return { area: v.area, file: v.file, verdict: v.verdict, reason: v.reason, testsUntouched: v.testsUntouched, assertionsWeakened: v.assertionsWeakened, passesAreaTest: v.passesAreaTest } }),
  critic: { verdict: critic ? critic.verdict : 'UNKNOWN', issues: critic ? critic.issues : [] },
}