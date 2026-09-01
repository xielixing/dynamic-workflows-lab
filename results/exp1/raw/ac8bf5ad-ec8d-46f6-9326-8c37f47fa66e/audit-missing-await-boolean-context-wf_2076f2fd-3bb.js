export const meta = {
  name: 'audit-missing-await-boolean-context',
  description: 'Audit every src/**/*.ts file for async Promise results used directly in boolean context without await',
  phases: [
    { title: 'Audit', detail: 'one agent per src file scanning for missing-await boolean-context bugs' },
    { title: 'Consolidate', detail: 'merge per-file findings into one verified report' },
  ],
}

const FILES = [
  'src/index.ts',
  'src/inventory/reservationService.ts',
  'src/inventory/stockService.ts',
  'src/inventory/supplierSync.ts',
  'src/notifications/digestBuilder.ts',
  'src/notifications/emailService.ts',
  'src/notifications/pushService.ts',
  'src/notifications/smsService.ts',
  'src/orders/fulfillmentService.ts',
  'src/orders/orderService.ts',
  'src/orders/returnsService.ts',
  'src/pricing/currencyRates.ts',
  'src/pricing/discountEngine.ts',
  'src/pricing/priceCalculator.ts',
  'src/pricing/promoCodes.ts',
  'src/reporting/auditTrail.ts',
  'src/reporting/metricsAggregator.ts',
  'src/reporting/salesReporter.ts',
  'src/shared/db.ts',
  'src/shared/logger.ts',
  'src/shared/types.ts',
  'src/users/authService.ts',
  'src/users/profileService.ts',
  'src/users/userService.ts',
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer' },
          function: { type: 'string' },
          call: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['line', 'function', 'call', 'explanation'],
      },
    },
  },
  required: ['file', 'findings'],
}

function auditPrompt(file) {
  return `You are auditing exactly ONE file in a READ-ONLY TypeScript code audit. Do not modify, create, or delete anything.

File under audit (repo-relative path, readable directly from the repo root): ${file}

## Bug pattern to find
A call to an async / promise-returning function whose Promise result is used DIRECTLY in a boolean context WITHOUT \`await\`:
- the call sits inside an \`if (...)\` / \`else if (...)\` / \`while (...)\` condition, or
- it follows a \`!\` (\`if (!someAsync())\`), or
- it is a ternary condition (\`someAsync() ? a : b\`), or
- it participates in a \`&&\` / \`||\` chain in boolean position.
A Promise object is ALWAYS truthy, so such a guard is a constant: \`if (asyncCall())\` always enters its branch, \`if (!asyncCall())\` never does, and any async logic the author intended behind that guard is silently dead.

## How to audit this file
1. Read the file in full.
2. Enumerate every async / promise-returning function relevant to this file:
   - functions declared \`async\` in this file, including arrow funcs and methods;
   - sync functions in this file that \`return someAsyncCall()\` or otherwise construct/return a Promise (check their bodies);
   - imported functions used at call sites — if unsure whether an imported function is async, grep the exporting module for its definition (\`export async function f\`, \`export const f = async\`, \`f = () => new Promise\`) to confirm it returns a Promise.
3. For EVERY call to such a function, check where its return value goes. The bug is: return value consumed in a boolean context and never awaited.
4. Record each genuine match with a 1-based line number.

## Do NOT report (given as legal)
- \`void someAsync()\` or a bare statement call — fire-and-forget, result deliberately discarded.
- \`someAsync().catch(...)\` / \`someAsync().then(...)\` — handled by promise chaining.
- \`return someAsync()\` from inside an async function — result deliberately returned for the caller to handle.
- \`await someAsync()\` anywhere, including inside a boolean condition.
- Values previously awaited: \`const r = await f(); if (r)\` is fine. BUT \`const r = f(); ... if (r)\` IS the bug — stored then used in boolean context without awaiting — report it.
- Sync (non-promise-returning) calls in boolean contexts — out of scope even when un-awaited.

The audit target MUST be a value that is actually a Promise at that call. If the called thing definitely returns a concrete value, it is out of scope.

## Output contract
Return STRICT structured data via the schema (do not write prose outside it):
- \`file\`: exactly "${file}".
- \`findings\`: array of {\`line\` (1-based number), \`function\` (enclosing function name, or "<top-level>"), \`call\` (exact source text of the offending call expression), \`explanation\` (which guard is broken, why — Promise is always truthy — and where an \`await\` is missing)}.
- If the file is clean: \`findings\`: [].`
}

function consolidatePrompt(merged) {
  return `You are the CONSOLIDATOR for a read-only audit of one specific TypeScript bug pattern: an async function's Promise result used directly in a boolean context without \`await\` (an \`if\` / \`!\` / ternary / \`&&\` guard that is silently constant because a Promise is always truthy).

Per-file audit agents produced these merged structured findings:
\`\`\`json
${JSON.stringify(merged, null, 2)}
\`\`\`

## What you must do
For EACH finding, open the cited file at the cited line (paths are repo-relative to the current working directory) and VERIFY:
- The call at that line is genuinely to an async / promise-returning function.
- Its result is used in a boolean context and is not awaited (confirm no \`await\` on that call, and that any promise stored in a variable from it is later consumed as a boolean too).
- None of the legal patterns apply: it is not \`void\`-discarded, not handled via \`.catch()\`/\`.then()\`, not \`return\`ed from an async function, not itself awaited.
Mark each finding CONFIRMED or FALSE_POSITIVE with a one-line reason.

## Output
Write a single consolidated Markdown report (your final text — no files modified):
1. Summary line: files audited, files with findings, total findings, confirmed count.
2. A section per directory (or per file) listing each confirmed finding as: \`file:line\` in \`function\` — \`call\` — one-sentence explanation of the broken guard and what the fix (inserting \`await\`) would change.
3. Any FALSE_POSITIVE findings listed separately with the reason dropped.
Keep it tight and factual. If zero confirmed findings, say so plainly.`
}

phase('Audit')
log(`Auditing ${FILES.length} files under src/, one agent per file`)
const perFile = await parallel(
  FILES.map(file => () =>
    agent(auditPrompt(file), {
      label: `audit:${file.split('/').slice(-1)[0]}`,
      phase: 'Audit',
      schema: FINDINGS_SCHEMA,
    })
  )
)
const accepted = perFile.filter(Boolean)
const merged = accepted.flatMap(r =>
  (r.findings || []).map(f => ({
    file: r.file,
    line: f.line,
    function: f.function,
    call: f.call,
    explanation: f.explanation,
  }))
)
const filesWithFindings = new Set(merged.map(f => f.file)).size
log(`Audit agents done: ${accepted.length}/${FILES.length} returned, ${merged.length} total findings across ${filesWithFindings} file(s)`)

phase('Consolidate')
if (merged.length === 0) {
  log('No findings — clean')
  return {
    filesAudited: FILES.length,
    filesWithFindings: 0,
    totalFindings: 0,
    report: `# Missing-await-in-boolean-context audit: CLEAN

All ${FILES.length} TypeScript files under \`src/\` were audited (one agent per file). No Promise-returning call was found used directly in a boolean context without \`await\`.`,
  }
}

const report = await agent(consolidatePrompt(merged), {
  label: 'consolidate',
  phase: 'Consolidate',
})
return {
  filesAudited: FILES.length,
  filesWithFindings,
  totalFindings: merged.length,
  rawFindings: merged,
  report,
}