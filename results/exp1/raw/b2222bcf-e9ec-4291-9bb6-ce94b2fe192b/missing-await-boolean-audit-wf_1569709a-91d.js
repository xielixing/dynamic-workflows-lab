export const meta = {
  name: 'missing-await-boolean-audit',
  description: 'Audit every src/ TypeScript file for an async Promise used directly in boolean context (missing await)',
  phases: [
    { title: 'Audit', detail: 'one agent per file under src/, structured findings' },
    { title: 'Merge', detail: 'consolidate per-file results into a single report' },
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
  properties: {
    file: { type: 'string' },
    line: { type: 'integer' },
    function: { type: 'string' },
    call: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['file', 'line', 'function', 'call', 'explanation'],
  additionalProperties: false,
}

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING_SCHEMA },
  },
  required: ['findings'],
  additionalProperties: false,
}

const auditPrompt = (file) => `You are auditing exactly ONE TypeScript source file for one specific bug pattern.

BUG PATTERN: an async function's Promise result used directly in a boolean context — a missing \`await\` before a call whose result feeds an \`if\` / \`!\` / ternary / \`&&\` guard. Because a Promise object is always truthy, the guard never reflects the async outcome and the intended logic silently breaks.

FILE TO AUDIT (repo-relative path): ${file}
REPO ROOT (working directory): C:\codeagent\dynamic-workflows-lab\fixtures\exp1-audit

PROCEDURE:
1. Use the Read tool to read ${file}.
2. Identify async functions (declared \`async\` or returning \`Promise<...>\`).
3. Find every NON-awaited call to such an async function whose return value is consumed in a boolean context:
   - \`if (someAsync())\` or \`if (!someAsync())\`
   - \`someAsync() && other\` or \`other || someAsync()\`
   - \`const ok = someAsync(); if (ok) {...}\` / \`if (!ok) {...}\` — result captured in a variable, then used as a boolean
   - a ternary whose condition or boolean operand is a non-awaited async call
4. INCLUDE indirect cases: a promise assigned to a variable is later used in a boolean guard without await.
   Also include promises passed as the condition to \`if\`/\`while\`/\`!\`/\`&&\`/\`||\`/\`?\`/\`:\` even when nested.

5. DO NOT report (these are fine):
   - Bare statement call whose result is discarded: \`someAsync()\` alone on its own line
   - Fire-and-forget with explicit \`void someAsync()\`
   - Promises handled by \`.catch(...)\` or \`.then(...)\`
   - \`return someAsync()\` or \`return await someAsync()\` inside an async function (the caller receives the promise — correct)
   - Properly awaited calls \`await someAsync()\`
   - Calls to functions that return a plain boolean synchronously (not async)

6. OUTPUT: return the structured object with a \`findings\` array. For each confirmed bug:
   - file: the repo-relative path \`${file}\`
   - line: 1-indexed line number of the offending expression
   - function: the enclosing function/method name
   - call: a short exact snippet of the offending call (e.g. \`hasPermission(user, action)\`)
   - explanation: 2-3 sentences explaining how the guard silently breaks (the always-truthy Promise object, so the async result is never consulted)

   If there are no genuine bugs in this file, return \`{ findings: [] }\`.

READ-ONLY: do not modify, create, or delete any files under the repo.`

phase('Audit')
const perFile = await pipeline(
  FILES,
  (file) => agent(auditPrompt(file), {
    label: `audit:${file}`,
    phase: 'Audit',
    schema: AUDIT_SCHEMA,
    effort: 'high',
  })
)

const audited = perFile.filter(Boolean)
const allFindings = audited.flatMap((r) => r.findings)
const filesWithFindings = new Set(allFindings.map((f) => f.file))

phase('Merge')
log('merged ' + allFindings.length + ' finding(s) across ' + audited.length + '/' + FILES.length + ' files')

return {
  summary: {
    totalFiles: FILES.length,
    auditedFiles: audited.length,
    totalFindings: allFindings.length,
    filesWithFindings: filesWithFindings.size,
  },
  findings: allFindings,
  cleanFiles: FILES.filter((f) => !filesWithFindings.has(f)),
}