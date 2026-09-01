# Exp1 summary

ground truth: 6 planted bugs across 24 files

| arm | run | recall | collectiveRecall | precision | findings | FP | filesAudited | agents | distinctPrompts | mainTok | mainCtxMax | subTok | grand | dur(s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| nl | 1 | 1 | 1 | 1 | 12 | 0 | 24/24 | 6 | 6 | 171198 | 40710 | 25410 | 196608 | 174 |
| nl | 2 | 0 | 1 | 0 | 0 | 0 | 24/24 | 8 | 8 | 556908 | 49158 | 0 | 556908 | 202 |
| nl | 3 | 1 | 1 | 1 | 6 | 0 | 24/24 | 4 | 4 | 344761 | 38570 | 0 | 344761 | 151 |
| nl | 4 | 1 | 1 | 1 | 12 | 0 | 24/24 | 4 | 4 | 337483 | 39314 | 0 | 337483 | 163 |
| nl | 5 | 0 | 1 | 0 | 0 | 0 | 24/24 | 4 | 4 | 438850 | 47449 | 0 | 438850 | 204 |
| wf | 1 | 1 | 0.17 | 1 | 6 | 0 | 24/24 | 25 | 17 | 187592 | 35083 | 37945 | 225537 | 175 |
| wf | 2 | 1 | 0 | 1 | 6 | 0 | 24/24 | 25 | 17 | 217132 | 44311 | 76033 | 293165 | 169 |
| wf | 3 | 1 | 0.33 | 1 | 6 | 0 | 0/24 | 25 | 2 | 186287 | 33809 | 95473 | 281760 | 115 |
| wf | 4 | 1 | 1 | 1 | 6 | 0 | 24/24 | 26 | 18 | 342956 | 40903 | 19713 | 362669 | 250 |
| wf | 5 | 1 | 0 | 1 | 6 | 0 | 24/24 | 25 | 17 | 215306 | 37767 | 58963 | 274269 | 328 |

## Stability

- **nl**: meanJaccard=0.4 recallRuns=1,0,1,1,0 stddev=0.49
- **wf**: meanJaccard=1 recallRuns=1,1,1,1,1 stddev=0

## Aggregates

```json
{
  "nl": {
    "meanGrandTokens": 374922,
    "meanMainTokens": 369840,
    "meanMainCtxMax": 43040.2,
    "meanRecall": 0.6,
    "meanDurationSec": 178
  },
  "wf": {
    "meanGrandTokens": 287480,
    "meanMainTokens": 229854.6,
    "meanMainCtxMax": 38374.6,
    "meanRecall": 1,
    "meanDurationSec": 207
  }
}
```