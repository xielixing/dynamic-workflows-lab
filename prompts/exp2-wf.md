ultracode: use a workflow to make the failing test suite in this repository pass.

Requirements for the workflow:
- Diagnose the failing tests in parallel; for each suspected root cause, spawn a fix agent, then adversarially verify each fix against both the test intent and the diff (an independent verifier agent per fix).
- Loop until `npm test` passes AND `npx tsc --noEmit` is clean; stop early only if two consecutive rounds make no progress.
- Fix root causes, not symptoms. Do not modify anything under tests/; do not weaken assertions.
- Finish with a summary of each root cause and its fix.
