# Exp1 summary

ground truth: 6 planted bugs across 24 files

| arm | run | recall | collectiveRecall | precision | findings | FP | filesAudited | agents | distinctPrompts | mainTok | mainCtxMax | subTok | grand | dur(s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nl | 1 | 0 | 1 | 0 | 0 | 0 | 24/24 | 7 | 7 | 320619 | 39727 | 0 | 320619 | 120 |
| wf | 1 | 1 | 1 | 0.92 | 13 | 1 | 24/24 | 25 | 17 | 226864 | 36284 | 76032 | 302896 | 159 |

## Stability

- **nl**: meanJaccard=null recallRuns=0 stddev=0
- **wf**: meanJaccard=null recallRuns=1 stddev=0

## Aggregates

```json
{
  "nl": {
    "meanGrandTokens": 320619,
    "meanMainTokens": 320619,
    "meanMainCtxMax": 39727,
    "meanRecall": 0,
    "meanDurationSec": 120
  },
  "wf": {
    "meanGrandTokens": 302896,
    "meanMainTokens": 226864,
    "meanMainCtxMax": 36284,
    "meanRecall": 1,
    "meanDurationSec": 159
  }
}
```