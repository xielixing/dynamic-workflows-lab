export const meta = {
  name: 'missing-await-boolean-audit',
  description: 'Audit every TS file under src/ for un-awaited promises used in boolean context',
  phases: [
    { title: 'Audit', detail: 'one agent per TS file under src/' },
    { title: 'Consolidate', detail: 'merge per-file findings into one report' },
  ],
}

const ABS = 'C:/codeagent/dynamic-workflows-lab/fixtures/exp1-audit/'

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

const FINDING = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'line', 'function', 'call', 'explanation'],
  properties: {
    file: { type: 'string' },
    line: { type: 'integer' },
    function: { type: 'string' },
    call: { type: 'string' },
    explanation: { type: 'string' },
  },
}

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: { type: 'array', items: FINDING },
  },
}

function auditPrompt(file) {
  return [
    'You are auditing ONE TypeScript file for ONE specific silent bug pattern. Your final structured output is data — a findings list — not a message to a human.',
    '',
    'Audit target: ' + file,
    'Read the entire file first with the Read tool. Absolute path: ' + ABS + file + ' (forward slashes are fine on Windows).',
    '',
    'THE BUG PATTERN (the only thing to look for): an async call returning a Promise is MISSING its await, and the Promise object (always truthy) is consumed in a boolean context. The guard logic silently breaks: the branch outcome never depends on the async result. Also known as an un-awaited promise used as a condition.',
    '',
    'Flag these shapes:',
    '  - const ok = someAsyncCheck()   (no await)   then later:   if (ok)  /  if (!ok)  /  while (ok)  /  !ok && x  /  ok ? a : b',
    '  - if (someAsync())  /  if (!someAsync())  /  if (someAsync() && other)  /  someAsync() || fallback  /  someAsync() ? a : b',
    '  - do { ... } while (someAsync())  /  while (!someAsync())',
    '  - Boolean(someAsync()) or !!someAsync() used as a condition.',
    '  - A promise stored in a variable on one line and used in a boolean context on another line — still the same bug; flag it and mention both lines in the explanation.',
    '  - Checking an un-awaited promise for emptiness:  if (promise == null)  or  if (promise != null)  — a Promise object is never null, so == null is always false and != null always true. Same silent break.',
    '',
    'DO NOT flag (intentional or fine):',
    '  - Properly awaited uses:  const x = await f();  /  if (await f())  /  const p = await f(); if (p)  /  fn(await x).',
    '  - Fire-and-forget with the result discarded: a bare statement  someAsync();  ,  void someAsync();  , or a .then() chain whose result is unused in a boolean context.',
    '  - Promises handled with .catch() in the same chain (intentional fire-and-forget).',
    '  - return someAsync()  inside an async function — the promise is delegated to the caller, not used in a boolean context here.',
    '  - Purely synchronous boolean logic (no promise involved).',
    '  - Inside a .then((v) => v ? a : b) callback, where v is the already-resolved value — a resolved value in a boolean context is normal. Only flag it if the raw Promise itself is used.',
    '',
    'TOOLS: you have Read and Grep. Read the target file fully. Grep across src/ to confirm any callee returns a Promise (note: every db.<table> method in shared/db.ts is async, e.g. find/where/count/has/is/check-style methods; async functions return promises).',
    '',
    'PER-FINDING FIELD RULES',
    '  - file: exactly ' + file + '.',
    '  - line: 1-based line number of the clearest anchor for the missing await — usually the boolean-use line (the if / ! / ternary / && / ||), or the assignment line if the promise is stored and later consumed; name any second location in the explanation.',
    '  - function: enclosing function or method name; use "top-level" for module-scope code.',
    '  - call: short code snippet of the offending expression(s) copied from THIS file.',
    '  - explanation: 1-3 sentences: what the author intended, why it silently misbehaves (a Promise object is always truthy, so if(p) is always true and if(!p) always false), and the concrete consequence in this file.',
    '',
    'VERIFY EVERY CANDIDATE BEFORE RETURNING:',
    '  1. The called expression really returns a Promise (grep for the callee definition if unsure — async functions and functions returning Promises qualify).',
    '  2. There is no await resolving it at that use site, and it is not returned, void-ed, or .catch() handled.',
    '  3. It is genuinely consumed in a boolean context (if / else-if / while / do-while / ternary condition / && / || / ! / Boolean() / null-check on the promise).',
    '  4. Grep the file for "await" and for the variable name to make sure you did not miss a resolution elsewhere.',
    'Skip any candidate that fails this verification.',
    '',
    'If the file is clean, return an EMPTY findings array. Do not invent findings. Do not report style, performance, or unrelated issues.',
  ].join('\n')
}

phase('Audit')
const results = await parallel(FILES.map((file) => () => agent(auditPrompt(file), { label: file, phase: 'Audit', schema: AUDIT_SCHEMA })))

phase('Consolidate')
const findings = []
let filesUnaudited = 0
FILES.forEach((file, i) => {
  const res = results[i]
  if (!res || !Array.isArray(res.findings)) {
    filesUnaudited++
    log('no result for ' + file)
    return
  }
  for (const raw of res.findings) {
    if (!raw || typeof raw !== 'object') continue
    findings.push({
      file: raw.file && typeof raw.file === 'string' && raw.file.trim() ? raw.file : file,
      line: Number.isInteger(raw.line) ? raw.line : 0,
      function: raw.function && typeof raw.function === 'string' ? raw.function : '(unknown)',
      call: raw.call && typeof raw.call === 'string' ? raw.call : '',
      explanation: raw.explanation && typeof raw.explanation === 'string' ? raw.explanation : '',
    })
  }
})
findings.sort(function (a, b) {
  if (a.file === b.file) return a.line - b.line
  return a.file < b.file ? -1 : 1
})

const filesWithFindings = new Set(findings.map(function (f) { return f.file })).size
const filesClean = FILES.length - filesUnaudited - filesWithFindings
log('merged: ' + findings.length + ' findings in ' + filesWithFindings + ' files; ' + filesClean + ' clean; ' + filesUnaudited + ' unaudited')

return {
  auditedFiles: FILES.length,
  filesWithFindings: filesWithFindings,
  filesClean: filesClean,
  filesUnaudited: filesUnaudited,
  totalFindings: findings.length,
  findings: findings,
}