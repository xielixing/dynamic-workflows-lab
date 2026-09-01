export const meta = {
  name: 'audit-missing-await-boolean',
  description: 'Audit every src/*.ts file for Promise results used directly in boolean context (missing await)',
  whenToUse: 'Read-only audit for missing-await bugs in boolean guards across all TypeScript files under src/',
  phases: [
    { title: 'Audit', detail: 'one agent per TS file under src/ scans for the pattern' },
    { title: 'Merge', detail: 'consolidate per-file findings into one report' },
  ],
}

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

const FINDING_SCHEMA = {
  type: 'object',
  required: ['file', 'findings'],
  properties: {
    file: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['line', 'function', 'call', 'explanation'],
        properties: {
          line: { type: 'integer' },
          function: { type: 'string' },
          call: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

function auditPrompt(file) {
  return `You are auditing EXACTLY ONE TypeScript file for a specific bug pattern. Read the file at "${file}" in full before concluding.

TARGET BUG PATTERN: missing \`await\` — a call to an async function (or any function returning a Promise/PromiseLike) whose result is used DIRECTLY in a boolean context:
- \`if (someAsync()) { ... }\`
- \`!someAsync()\`
- \`someAsync() && x\`  or  \`x || someAsync()\`
- \`someAsync() ? a : b\`
- \`while (someAsync())\`, \`do { ... } while (someAsync())\`
- \`Boolean(someAsync())\`, or any other guard where the Promise object itself is the tested value.

Because a Promise object is always truthy, these guards are silently broken:
- \`if (promise)\` always takes the true-branch
- \`!promise\` is always false (the guard never fires)
- \`promise && x\` always evaluates \`x\`
- \`promise ? a : b\` always picks \`a\`

DO NOT REPORT — these are fine, ignore entirely:
1. Awaited calls: \`if (await someAsync())\`, \`!(await someAsync())\`, \`const r = await someAsync(); if (r)\`, etc.
2. Fire-and-forget / voided: \`void someAsync();\` or a bare \`someAsync();\` statement with no boolean use of its result.
3. Returned promises: \`return someAsync();\` from an async function (the caller handles it).
4. Chains with handlers: \`someAsync().then(...)\`, \`someAsync().catch(...)\`, \`someAsync().finally(...)\` — the promise is consumed via handlers, which is acceptable handling. (Only if the RESULT of such a chain is ITSELF fed into a boolean test without await, report that specific use.)
5. Non-Promise calls: ONLY flag calls that actually return a Promise — the callee is declared \`async\`, returns \`Promise<...>\`/\`PromiseLike<...>\`, or returns \`new Promise(...)\`. Do not flag synchronous functions, plain object/boolean/string getters, or type-only references.
6. Services/high-order wrappers where the promise is intentionally awaited one line earlier and the variable is tested — the bug is specifically calling the async function WITHOUT await inside the boolean test.

REPORT FIELDS:
- file: "${file}"
- line: 1-based line number of the offending boolean test
- function: enclosing function name, or "module top-level", or "<anonymous>" for a callback (e.g. \`.map((x) => ...)\`)
- call: the exact code snippet of the boolean test (keep it short, e.g. \`if (stockService.decrement(qty))\`)
- explanation: one or two sentences on why the guard silently breaks (what branch/result is always taken)

Return the file path in \`file\` and every distinct finding in \`findings\`. If the file is clean, return \`findings: []\`. Only list TRUE positives — a Promise in a boolean context without await IS the bug; do not invent speculative ones. Be precise about line numbers.`
}

phase('Audit')
const results = await parallel(FILES.map((f) => () =>
  agent(auditPrompt(f), { label: `audit:${f.split('/').pop()}`, phase: 'Audit', schema: FINDING_SCHEMA })
))

phase('Merge')
const completed = results.filter(Boolean)
const merged = completed.flatMap((r) => (Array.isArray(r.findings) ? r.findings : []).map((f) => ({ file: r.file, ...f })))

const cleanCount = completed.filter((r) => !Array.isArray(r.findings) || r.findings.length === 0).length
log(`audited ${completed.length}/${FILES.length} files; ${cleanCount} clean; ${merged.length} total findings (${completed.length - cleanCount} files with findings)`)
return merged