export const meta = {
  name: 'exp2-fix-round',
  description: 'One round: parallel diagnose → fix per root cause → adversarial verify per fix',
  phases: [
    { title: 'Diagnose', detail: 'parallel root-cause analysis per failing test' },
    { title: 'Fix', detail: 'one fix agent per root cause' },
    { title: 'Verify', detail: 'independent adversarial verifier per fix' },
    { title: 'Correct', detail: 're-fix anything the verifiers refuted' },
  ],
}

const CWD = 'C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp2-fix'

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string', description: 'src/ file containing the root cause' },
    rootCause: { type: 'string', description: 'one-sentence root cause of the failure' },
    fix: { type: 'string', description: 'minimal fix to apply' },
    confident: { type: 'boolean', description: 'true only if the root cause was clearly located' },
  },
  required: ['file', 'rootCause', 'fix', 'confident'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string', description: 'src file that was edited' },
    applied: { type: 'boolean', description: 'whether an edit was applied this round' },
    summary: { type: 'string', description: 'exact change made (e.g. one-line diff) and the verification command result' },
  },
  required: ['file', 'applied', 'summary'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED'] },
    testPassed: { type: 'boolean', description: 'did the matching vitest test file pass' },
    reason: { type: 'string', description: 'why the fix is or is not correct/minimal/root-cause' },
  },
  required: ['file', 'verdict', 'testPassed', 'reason'],
}

phase('Diagnose')
const findings = (await parallel((args.failures || []).map((f) => () =>
  agent(
    `You are diagnosing a failing test in a TypeScript repo. Working directory: ${CWD}.

Failing test file: ${f.testFile}
Fixture spec being tested: ${f.spec}
Observed failure (from the test runner): ${f.failure}
Suspect source modules: ${f.src}

STEP 1: Read the test file under tests/ and the source modules under src/.
STEP 2: Identify the ROOT CAUSE — this fixture has planted bugs. Common kinds: a wrong constant in src/config.ts, a missing +1 off-by-one, a missing rounding step, a wrong property name, a wrong sort comparator, or a swallowed error.
STEP 3: Report the exact src/ file, the root cause, and the minimal fix.

Rules: never modify tests/; never weaken an assertion; fix the root cause, not a symptom. If the source already looks correct and you cannot locate a bug, set confident=false and say what you checked.`,
    { label: `diagnose:${f.id}`, phase: 'Diagnose', schema: FINDING_SCHEMA }
  )))).filter(Boolean)

const seen = new Set()
const rootCauses = []
for (const fd of findings) {
  if (fd.confident && fd.file && !seen.has(fd.file)) {
    seen.add(fd.file)
    rootCauses.push(fd)
  }
}
log(`Diagnosed ${rootCauses.length} root causes from ${findings.length} findings`)

phase('Fix')
const fixed = (await parallel(rootCauses.map((fd) => () =>
  agent(
    `Apply the minimal root-cause fix in the TypeScript repo at ${CWD}.

File to fix: ${fd.file}
Root cause: ${fd.rootCause}
Fix to apply: ${fd.fix}

Read the file, then apply the smallest correct edit (usually one line).
- Do NOT modify anything under tests/.
- Do NOT weaken or change assertions.
- Do NOT hardcode constants at call sites that belong in src/config.ts (config is the single source of truth).
- Do NOT run git commit; only edit the working tree.
- After editing, sanity-check with the matching test: run e.g. \`npx vitest run tests/<matching-file>.test.ts\` (and \`npx tsc --noEmit\` if relevant). If the file was already fixed in a previous round, just confirm and re-run the check.
Report exactly what you changed.`,
    { label: `fix:${fd.file}`, phase: 'Fix', schema: FIX_SCHEMA }
  )))).filter(Boolean)

phase('Verify')
const verifyOne = (fx) => agent(
  `Adversarially verify a fix just applied to ${fx.file} in the repo at ${CWD}.

Fix agent's claim: ${fx.summary}

STEP 1: Run \`git diff -- ${fx.file}\` and READ the actual change.
STEP 2: Read the matching test file under tests/ — the file this fix is meant to make pass. Confirm the test's REAL intent (the exact expectations) and that the fix satisfies the source-level intent.
STEP 3: Confirm nothing under tests/ was modified: \`git diff --stat -- tests\` must be empty.
STEP 4: Run the matching test: \`npx vitest run <matching test file>\`.
STEP 5: Try to REFUTE the fix. Is it a symptom patch (e.g. special-casing the test inputs rather than fixing the root cause)? Wrong file? Over-engineered? Does it introduce a TS error (\`npx tsc --noEmit\`)? Could it pass while the source is still wrong?

Return verdict CONFIRMED only if all of: test file passes, tests/ is untouched, the diff is minimal, and it targets the diagnosed root cause. Otherwise REFUTED, and the reason must state the correct fix.`,
  { label: `verify:${fx.file}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' }
)

let verified = (await parallel(fixed.map((fx) => () => verifyOne(fx)))).filter(Boolean)

phase('Correct')
const refuted = fixed.filter((fx) => {
  const v = verified.find((r) => r && r.file === fx.file)
  return !v || v.verdict !== 'CONFIRMED' || !v.testPassed
})
let refixed = []
if (refuted.length) {
  log(`Correcting ${refuted.length} refuted fix(es)`)
  refixed = (await parallel(refuted.map((fx) => () =>
    agent(
      `A previous fix for ${fx.file} in the repo at ${CWD} failed adversarial verification.

Previous fix attempt: ${fx.summary}
Verifier feedback: ${JSON.stringify(verified.find((r) => r && r.file === fx.file))}

Read the original test file under tests/, read the source, and apply the CORRECT root-cause fix — fixing whatever the previous attempt got wrong (wrong property, wrong constant, wrong comparator, symptom patch, etc.). Then re-run the matching vitest file to confirm it passes, and \`npx tsc --noEmit\` if relevant. Do NOT modify tests/. Do NOT weaken assertions. Report exactly what you changed.`,
      { label: `refix:${fx.file}`, phase: 'Correct', schema: FIX_SCHEMA }
    )))).filter(Boolean)
  verified = (await parallel(refixed.map((fx) => () => verifyOne(fx))))
    .filter(Boolean)
    .concat(verified.filter((r) => !refuted.some((f) => f.file === r.file)))
}

const summaryByFile = {}
for (const fx of fixed) summaryByFile[fx.file] = fx.summary
for (const fx of refixed) summaryByFile[fx.file] = fx.summary

return {
  round: args.round,
  fixes: verified.filter(Boolean).map((v) => {
    const d = rootCauses.find((r) => r.file === v.file)
    return {
      file: v.file,
      rootCause: d ? d.rootCause : null,
      fixSummary: summaryByFile[v.file] || null,
      verdict: v.verdict,
      testPassed: v.testPassed,
      verifierReason: v.reason,
    }
  }),
}