Use subagents to audit every TypeScript file under src/ in this repository for one specific bug pattern: an async function's Promise result used directly in boolean context (missing await before a call whose result feeds an `if` / `!` / ternary / `&&`), which silently breaks the intended guard logic.

Requirements:
- Go through every file under src/ (including subdirectories).
- For each issue found, report: file path, line number, enclosing function name, and the offending call expression.
- Ignore intentional fire-and-forget calls (e.g. `void someAsync()`) and promises handled via `.catch()` or returned from an async function — those are fine.
- End with a consolidated list of all findings.
- Do not modify any files. This is a read-only audit.
