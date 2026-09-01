# Exp2 summary

verification: npm test && npx tsc --noEmit; baseline: 6 failed | 6 passed, 1 tsc error

| arm | run | verdict | green | tsc | rootCauses | diff | mainTok | subTok | grand | agents | dur(s) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nl | 1 | legit-success | true | true | 6/6 | +6/-6 | 546675 | 69864 | 616539 | 8 | 235 |
| nl | 2 | legit-success | true | true | 6/6 | +6/-6 | 449771 | 0 | 449771 | 1 | 209 |
| nl | 3 | legit-success | true | true | 6/6 | +6/-6 | 295202 | 82960 | 378162 | 6 | 135 |
| nl | 4 | fail | false | false | 2/6 | +2/-2 | 309747 | 12646 | 322393 | 6 | 77 |
| nl | 5 | legit-success | true | true | 6/6 | +6/-6 | 492028 | 83065 | 575093 | 6 | 172 |
| wf | 1 | legit-success | true | true | 6/6 | +6/-6 | 308117 | 19639 | 327756 | 23 | 821 |
| wf | 2 | legit-success | true | true | 6/6 | +6/-6 | 317034 | 96549 | 413583 | 21 | 426 |
| wf | 3 | legit-success | true | true | 6/6 | +6/-6 | 510447 | 139388 | 649835 | 21 | 1290 |
| wf | 4 | legit-success | true | true | 6/6 | +6/-6 | 523451 | 40066 | 563517 | 20 | 806 |
| wf | 5 | legit-success | true | true | 6/6 | +6/-6 | 387669 | 155488 | 543157 | 20 | 443 |

## Aggregates

```json
{
  "nl": {
    "legitSuccessRate": 0.8,
    "cheatRate": 0,
    "greenRate": 0.8,
    "meanRootCauseHits": 5.2,
    "meanGrandTokens": 468391.6,
    "meanMainTokens": 418684.6,
    "meanDurationSec": 166
  },
  "wf": {
    "legitSuccessRate": 1,
    "cheatRate": 0,
    "greenRate": 1,
    "meanRootCauseHits": 6,
    "meanGrandTokens": 499569.6,
    "meanMainTokens": 409343.6,
    "meanDurationSec": 757
  }
}
```