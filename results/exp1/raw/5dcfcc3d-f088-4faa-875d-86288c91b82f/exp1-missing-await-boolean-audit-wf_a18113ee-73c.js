export const meta = {
  name: 'exp1-missing-await-boolean-audit',
  description: 'Audit every src/**/*.ts file for async Promise results used directly in boolean context (missing await)',
  phases: [
    { title: 'Audit', detail: 'one agent per src TS file, read-only' },
  ],
}

const FINDING_SCHEMA = {
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
  'src/orders/returnsService.ts',
  'src/users/userService.ts',
  'src/users/authService.ts',
  'src/users/profileService.ts',
  'src/notifications/emailService.ts',
  'src/notifications/pushService.ts',
  'src/notifications/smsService.ts',
  'src/notifications/digestBuilder.ts',
  'src/reporting/salesReporter.ts',
  'src/reporting/auditTrail.ts',
  'src/reporting/metricsAggregator.ts',
]

function auditPrompt(path) {
  return `You are auditing exactly ONE TypeScript file for ONE specific bug pattern. Read-only: do not modify any files.

PATH (absolute): C:\\codeagent\\dynamic-workflows-lab\\fixtures\\exp1-audit\\${path}

THE BUG PATTERN
"Missing await in boolean context": a call to an async function (or any Promise-returning
expression) whose result is used directly where a boolean is expected, WITHOUT an \`await\`.
Because a Promise object is always truthy, the intended guard silently breaks — e.g.
\`if (!allowed)\` where \`allowed\` is actually a Promise<boolean> is always true; \`if (exists)\`
where \`exists\` is a Promise<boolean> is always true; \`ok && proceed()\` where \`ok\` is a
promise short-circuits for the wrong reason; \`!pending\`, ternary conditions, \`while (poll())\`,
\`assert(approved)\`, etc.

TASKS
1. Read the file.
2. Find every Promise-returning expression used in a boolean context (condition of
   if/while/for/do, operand of \`!\`, \`&&\`/\`||\`, ternary condition, assertion/guard call).
3. Determine whether it is actually a Promise (async function, \`Promise\` type, \`.then\`, an
   awaited-and-wrapped value, or an imported function you know is async). You MAY read other
   files under the same src/ tree ONLY to confirm whether an imported function is async.
4. Report each confirmed or strongly-suspected instance.

DO NOT REPORT (intentional / safe — explicitly excluded by the audit spec):
- Fire-and-forget calls, e.g. \`void someAsync()\`.
- Chains that handle the promise: \`someAsync().catch(...)\` or \`.then(...)\` used as the handler itself.
- A promise returned FROM an async function (\`return someAsync();\` inside \`async function\`) —
  that preserves the promise down the chain; not a boolean misuse.
- A promise stored and later awaited (\`const p = f(); ... await p\`), passed to a function that
  awaits it, or used as a plain value (e.g. pushed into an array, stored on an object).
- Synchronous booleans/numbers/strings — only Promise-returning expr counts.

In the returned \`file\` field use EXACTLY: ${path}

Each finding must include:
- line: 1-based line number of the statement where the promise is used in boolean context.
- function: name of the enclosing function (or <module-top-level>).
- call: the exact offending expression, single line.
- explanation: 1-3 sentences — what the guard was checking, why the missing await makes the
  boolean always-true/always-false, and the intended correct form (\`await ...\`).

Return findings as an array (empty array if the file is clean). Be thorough but do not invent
findings — if the expression is definitely not a promise, do not report it.`
}

phase('Audit')
log(`Spawning ${FILES.length} audit agents — one per src file`)
const results = await parallel(FILES.map((path) => () =>
  agent(auditPrompt(path), { label: `audit:${path}`, phase: 'Audit', schema: FINDING_SCHEMA })
))

log('Consolidating per-file findings into one report')
const perFile = FILES
  .map((path, i) => {
    const r = results[i]
    if (!r) return null
    return { path, findings: Array.isArray(r.findings) ? r.findings : [] }
  })
  .filter(Boolean)

const filesWithFindings = perFile.filter((f) => f.findings.length > 0)
const allFindings = filesWithFindings
  .flatMap((f) =>
    f.findings.map((x) => ({
      file: f.path,
      line: x.line,
      function: x.function,
      call: x.call,
      explanation: x.explanation,
    }))
  )
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

return {
  totalFiles: FILES.length,
  filesAudited: perFile.length,
  filesWithFindings: filesWithFindings.map((f) => f.path),
  cleanFiles: perFile.filter((f) => f.findings.length === 0).map((f) => f.path),
  findingCount: allFindings.length,
  findings: allFindings,
}