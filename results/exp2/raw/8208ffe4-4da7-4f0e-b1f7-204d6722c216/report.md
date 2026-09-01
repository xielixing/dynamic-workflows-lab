Scouting confirms the current state: 6 failing tests across 6 modules, `tsc` reports 1 error (same `refunds.ts` bug). The `refundsSummary` string is correct, and `batchIds`' loop logic is correct — the root causes are all single-line fixes.

Now I'll design and run the workflow: parallel diagnosis → one fix agent per root cause → independent adversarial verifier per fix → verification gate, then loop if needed.

