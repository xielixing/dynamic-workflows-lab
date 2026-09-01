export const meta = {
  name: 'exp2-fix',
  description: 'Diagnose failing tests in parallel, fix each root cause, adversarially verify every fix independently, loop until npm test + tsc are green.',
  phases: [
    { title: 'Diagnose', detail: 'one agent per failing test file, parallel' },
    { title: 'Fix', detail: 'one fix agent per root cause, parallel' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
    { title: 'Gate', detail: 'full npm test + npx tsc --noEmit' },
  ],
}

const ROOT = 'C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix'

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    testFile: { type: 'string' },
    rootCause: { type: 'string' },
    testIntent: { type: 'string' },
    fixApproach: { type: 'string' },
  },
  required: ['file', 'testFile', 'rootCause', 'testIntent', 'fixApproach'],
  additionalProperties: false,
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    changeMade: { type: 'string' },
    rootCauseAddressed: { type: 'boolean' },
  },
  required: ['file', 'changeMade', 'rootCauseAddressed'],
  additionalProperties: false,
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    testPasses: { type: 'boolean' },
    typecheckClean: { type: 'boolean' },
    rootCauseFixed: { type: 'boolean' },
    noAssertionWeakening: { type: 'boolean' },
    diffMinimal: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['file', 'testPasses', 'typecheckClean', 'rootCauseFixed', 'noAssertionWeakening', 'diffMinimal', 'notes'],
  additionalProperties: false,
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    testsPass: { type: 'boolean' },
    typecheckClean: { type: 'boolean' },
    failingTests: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['testsPass', 'typecheckClean', 'failingTests'],
  additionalProperties: false,
}

const normFile = (f) => String(f || '').split(/[\\/]/).pop()

const TEST_FILES = [
  'tests/batching.test.ts',
  'tests/dates.test.ts',
  'tests/money.test.ts',
  'tests/refunds.test.ts',
  'tests/retry.test.ts',
  'tests/sorting.test.ts',
]

function diagnosePrompt(testFile) {
  return [
    `You are diagnosing a failing test. Repo root: ${ROOT}`,
    `First, run: npx vitest run ${testFile}   (from ${ROOT}) and read the failure output precisely.`,
    `Then read ${testFile} (the spec) and the matching src file it imports.`,
    `Identify the ROOT CAUSE in the src code (not the symptom). Also check npx tsc --noEmit for type errors involving that src file.`,
    `Return: the src file to fix (path relative to ${ROOT}), the test file path, a one-line root cause, what the test intends, and a minimal fix approach.`,
    `Do NOT edit any files — this is diagnosis only.`,
  ].join('\n')
}

function fixPrompt(d, prevNotes) {
  const notes = prevNotes ? `\nPrior adversarial review noted: ${prevNotes}\n` : ''
  return [
    `You are fixing a root cause in this repo. Repo root: ${ROOT}`,
    ``,
    `Test file (THE SPEC): ${d.testFile}`,
    `Diagnosed root cause: ${d.rootCause}`,
    `Test intent: ${d.testIntent}`,
    `Proposed approach: ${d.fixApproach}`,
    `Target file to edit: ${d.file}`,
    notes,
    `HARD CONSTRAINTS:`,
    `- Fix the ROOT CAUSE. Only edit ${d.file}.`,
    `- NEVER modify, rename, or delete anything under tests/ or anywhere else outside ${d.file}.`,
    `- Do NOT weaken, comment out, or change any test assertion.`,
    `- No hardcoding expected outputs, no special-casing test inputs, no sleep/delay hacks.`,
    `- Keep the change minimal and idiomatic for this codebase; the sibling passing test(s) in ${d.testFile} must keep passing.`,
    `- Sanity-check after editing, from ${ROOT}: npx vitest run ${d.testFile}   then   npx tsc --noEmit`,
    ``,
    `Report the file you changed and exactly what you changed.`,
  ].filter(Boolean).join('\n')
}

function verifyPrompt(fx, testFile) {
  return [
    `You are an INDEPENDENT adversarial verifier. Another agent claims to have fixed a failing test. Your job: try to REFUTE the fix.`,
    `Repo root: ${ROOT}`,
    ``,
    `Claimed file edited: ${fx.file}`,
    `Claimed change: ${fx.changeMade || '(none reported)'}`,
    `Relevant test file: ${testFile}`,
    ``,
    `1. Read ${testFile} and pin down the test intent exactly.`,
    `2. Read ${fx.file}, then inspect the actual change with:  git diff -- ${fx.file}   (run from ${ROOT}).`,
    `3. Attack the change:`,
    `   - Does it fix the ROOT CAUSE, or does it merely satisfy the assertions (hardcoding expected values, special-casing the test's inputs)?`,
    `   - Does it break the sibling passing test(s) in ${testFile}?`,
    `   - Did it touch anything under tests/ or outside ${fx.file}? (must be NO)`,
    `   - Is the diff minimal and idiomatic, not a symptom patch?`,
    `   - Does npx tsc --noEmit stay clean?`,
    `4. Run, from ${ROOT}:  npx vitest run ${testFile}   and   npx tsc --noEmit`,
    ``,
    `Mark testPasses=true and rootCauseFixed=true ONLY if the target test is green, tsc is clean, AND you could not refute that it is a genuine root-cause fix.`,
    `In notes, state the root cause and the fix that was applied.`,
  ].join('\n')
}

function gatePrompt() {
  return [
    `You are the CI gate for this repo. Repo root: ${ROOT}`,
    `From ${ROOT}, run:`,
    `  1. npm test`,
    `  2. npx tsc --noEmit`,
    `Set testsPass = all tests pass, typecheckClean = tsc exits 0.`,
    `If anything fails, list each unique failing test FILE path exactly as vitest names it, e.g. "tests/money.test.ts". Do NOT list individual test names.`,
    `If all green, failingTests = [].`,
  ].join('\n')
}

// ---- run ----

phase('Diagnose')
let diagnoses = (await parallel(TEST_FILES.map((tf) => () =>
  agent(diagnosePrompt(tf), { schema: DIAGNOSIS_SCHEMA, label: `diagnose:${normFile(tf)}`, phase: 'Diagnose' })
))).map((d, i) => d || {
  file: 'src/' + TEST_FILES[i].replace('tests/', '').replace('.test.ts', '.ts'),
  testFile: TEST_FILES[i],
  rootCause: 'unknown — investigate source',
  testIntent: 'make the failing assertions pass for real',
  fixApproach: 'read the source and test, fix the root cause',
})

// dedupe by src file (keep first)
const seenFiles = new Set()
let uniqueDiags = diagnoses.filter((d) => {
  const k = normFile(d.file)
  if (seenFiles.has(k)) return false
  seenFiles.add(k)
  return true
})

let failingKeys = new Set(uniqueDiags.map((d) => normFile(d.testFile)))
let noProgressStreak = 0
const verdictNotes = {}
let fixes = []
let verdicts = []
let gateResult = null
let round = 0

while (true) {
  round++
  log(`Round ${round}: ${failingKeys.size} failing test file(s)`)

  const fixTargets = uniqueDiags.filter((d) => failingKeys.has(normFile(d.testFile)))

  phase('Fix')
  fixes = (await parallel(fixTargets.map((d) => () =>
    agent(fixPrompt(d, verdictNotes[normFile(d.file)]), { schema: FIX_SCHEMA, label: `fix:${normFile(d.file)}`, phase: 'Fix' })
  ))).filter(Boolean)

  phase('Verify')
  verdicts = (await parallel(fixes.map((fx) => () => {
    const diag = uniqueDiags.find((d) => normFile(d.file) === normFile(fx.file))
    return agent(verifyPrompt(fx, diag ? diag.testFile : null), { schema: VERDICT_SCHEMA, label: `verify:${normFile(fx.file)}`, phase: 'Verify' })
  }))).filter(Boolean)

  verdicts.forEach((v) => {
    if (v && v.file) verdictNotes[normFile(v.file)] = v.notes || ''
  })

  phase('Gate')
  gateResult = await agent(gatePrompt(), { schema: GATE_SCHEMA, label: 'gate', phase: 'Gate' })

  if (!gateResult) {
    log('Gate agent produced no result — stopping to avoid a blind loop.')
    break
  }

  if (gateResult.testsPass && gateResult.typecheckClean) {
    log(`Round ${round}: npm test PASSES and tsc is CLEAN.`)
    break
  }

  const reported = (gateResult.failingTests || []).map((t) => normFile(t)).filter(Boolean)
  const newFailing = new Set(reported.length ? reported : [...failingKeys])
  const shrunk = newFailing.size < failingKeys.size
  failingKeys = newFailing
  if (shrunk) {
    noProgressStreak = 0
    log(`Round ${round}: progress — now ${failingKeys.size} failing test file(s).`)
  } else {
    noProgressStreak++
    log(`Round ${round}: no progress (${failingKeys.size} failing file(s)); streak=${noProgressStreak}`)
  }
  if (noProgressStreak >= 2) {
    log('Two consecutive rounds without progress — stopping early.')
    break
  }
  if (round >= 8) {
    log('Safety cap of 8 rounds reached.')
    break
  }
}

// ---- summary ----
const summary = uniqueDiags.map((d) => {
  const key = normFile(d.file)
  const fix = fixes.find((f) => f && normFile(f.file) === key)
  const v = verdicts.find((x) => x && x.file && normFile(x.file) === key)
  return {
    file: d.file,
    rootCause: d.rootCause,
    testIntent: d.testIntent,
    fixApplied: fix ? fix.changeMade : null,
    verdict: v ? (v.testPasses && v.rootCauseFixed ? 'PASS' : 'FAIL') : 'UNVERIFIED',
    verifierNotes: v ? v.notes : null,
  }
})

const green = gateResult && gateResult.testsPass && gateResult.typecheckClean

return {
  repoRoot: ROOT,
  rounds: round,
  green,
  gate: gateResult
    ? { testsPass: gateResult.testsPass, typecheckClean: gateResult.typecheckClean, failingTests: gateResult.failingTests }
    : null,
  summary,
}