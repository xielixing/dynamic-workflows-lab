ultracode: use a workflow to audit every TypeScript file under src/ in this repository for one specific bug pattern: an async function's Promise result used directly in boolean context (missing await before a call whose result feeds an `if` / `!` / ternary / `&&`), which silently breaks the intended guard logic.

Requirements for the workflow:
- One agent per file, covering every file under src/ (including subdirectories).
- Each audit agent returns structured output: { file, line, function, call, explanation } — an empty findings array if the file is clean.
- Ignore intentional fire-and-forget calls (e.g. `void someAsync()`) and promises handled via `.catch()` or returned from an async function — those are fine.
- Merge all per-file results into one consolidated report at the end.
- Do not modify any files. This is a read-only audit.
