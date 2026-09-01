export const meta = {
  name: 'audit-missing-await-boolean-context',
  description: 'Audit every TS file under src/ for promises used directly in boolean context (missing await)',
  phases: [
    { title: 'Audit', detail: 'one agent per file' },
    { title: 'Merge', detail: 'consolidate per-file results' },
  ],
}

const ROOT = 'C:/codeagent/dynamic-workflows-lab/fixtures/exp1-audit'

const FILES = [
  'src/shared/types.ts',
  'src/shared/logger.ts',
  'src/shared/db.ts',
  'src/index.ts',
  'src/pricing/currencyRates.ts',
  'src/pricing/priceCalculator.ts',
  'src/pricing/discountEngine.ts',
  'src/pricing/promoCodes.ts',
  'src/inventory/stockService.ts',
  'src/inventory/reservationService.ts',
  'src/inventory/supplierSync.ts',
  'src/orders/orderService.ts',
  'src/orders/fulfillmentService.ts',
  'src/users/userService.ts',
  'src/users/authService.ts',
  'src/users/profileService.ts',
  'src/notifications/emailService.ts',
  'src/notifications/pushService.ts',
  'src/reporting/salesReporter.ts',
  'src/notifications/digestBuilder.ts',
  'src/reporting/auditTrail.ts',
  'src/reporting/metricsAggregator.ts',
  'src/notifications/smsService.ts',
  'src/orders/returnsService.ts',
]

const RESULT_SCHEMA = {
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
  return `You are auditing one TypeScript source file for a single specific bug pattern. This is a READ-ONLY audit — do not modify any files.

FILE TO AUDIT (read it in full): ${'${ROOT}/${file}'}

THE BUG PATTERN — a Promise used directly in boolean context (missing await):
An async function's call result is used as a boolean without an \`await\`, so the guard is silently broken: a Promise object is always truthy.
- \`if (someAsync())\` is ALWAYS TRUE
- \`if (!someAsync())\` is ALWAYS FALSE
- \`const ok = someAsync() ? 'yes' : 'no'\` always picks the true branch
- \`done() && next()\` always evaluates \`next()\`

REPORT ONLY when the call result is consumed as a boolean in one of these positions:
- condition of \`if\`, \`while\`, or \`do...while\`
- operand of a \`!\` negation (\`!call()\`)
- condition (first operand) of a ternary \`cond ? a : b\`
- left or right operand of \`&&\` / \`||\` where the expression's value is used as a boolean decision
- parameter of a function parameter explicitly typed as boolean (e.g. \`assert(..., x === true)\` is a boolean comparison — only report when the promise VALUE itself is the boolean)

STRICTLY NOT BUGS — do NOT report:
- \`void someAsync()\` or a standalone statement call with no use of its result (fire-and-forget)
- Calls consumed via \`.then(...)\` / \`.catch(...)\` / \`.finally(...)\` chains
- A promise that is \`return\`ed from an async function (returning the promise is correct)
- Call sites that DO have \`await\` before them
- Calls to genuinely synchronous functions that return a real boolean (no async involved)
- Boolean comparisons of a promise (e.g. \`p === null\`) that do not use the promise as the boolean itself

REQUIRED VERIFICATION (be rigorous; false positives are the main risk):
1. Read the file at the absolute path above.
2. For every candidate boolean-context call, confirm the called function is actually async or returns a Promise. Check its definition in this file, or its declaration/import signature if it lives elsewhere in this repo (you may read other files under ${'${ROOT}/src'} to confirm, but the REPORTED line must be in the audited file).
3. Confirm the call site is not nested inside \`await\`, \`void\`, a \`return\`, a \`throw\`, or a \`.then()\`/\`.catch()\` argument.
4. Look for the receiving variable's type: if \`const x = someAsync(); if (x)\` — that is also the bug (x is a Promise). If \`if (x === true)\` where x is the promise — also report the comparison as equivalent to a truthiness check only if it mirrors boolean use; when in doubt, DON'T report.

For each confirmed instance return exactly:
- line: 1-based line number of the offending call in the file
- function: name of the enclosing function/method (or 'module scope' if at top level)
- call: the exact source text of the offending expression (trimmed)
- explanation: one sentence describing why it is a bug (e.g. 'always-true guard: isAvailable() returns a Promise')

\`file\` must be exactly '${file}'. If the file is clean, return \`findings: []\`. Do not invent findings — report only what you actually observe.`
}

phase('Audit')
const results = await parallel(FILES.map(f => () =>
  agent(auditPrompt(f), { label: `audit:${f}`, phase: 'Audit', schema: RESULT_SCHEMA })
))

phase('Merge')
const clean = results.filter(Boolean)
const findings = clean
  .flatMap(r => r.findings.map(f => ({ file: r.file, ...f })))
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

const consolidated = {
  filesAudited: FILES.length,
  filesWithFindings: clean.filter(r => r.findings.length).length,
  totalFindings: findings.length,
  findings,
}

log(`Audited ${consolidated.filesAudited} file(s); ${consolidated.totalFindings} finding(s) across ${consolidated.filesWithFindings} file(s)`)
return consolidated