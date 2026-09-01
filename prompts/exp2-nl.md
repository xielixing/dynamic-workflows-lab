The test suite in this repository is failing. Use subagents to investigate and fix the failures.

Requirements:
- Verification target: `npm test` passes AND `npx tsc --noEmit` is clean.
- Diagnose the root cause before changing code; fix root causes, not symptoms.
- Keep changes minimal and idiomatic.
- Do not modify anything under tests/ to make tests pass; do not weaken assertions.
- Iterate until both verification targets are met, then summarize what was wrong and what you changed.
