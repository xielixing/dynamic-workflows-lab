# 交互式实验记录（人工在交互式 Claude 里执行）

与无人值守矩阵（results/exp1、results/exp2）相互独立，用于人工验证与补充观察。
每轮按下面模板追加记录，由执行者提供原始观察，协作者整理归档。

## 模板

```
### RUN-IX-<编号>（实验 1 · WF 臂 · 交互式）
- 日期 / Claude Code 版本：
- 执行者观察：
  - Claude 是否自己写了编排脚本（贴开头几行）：
  - /workflows 面板：agent 数 / phase 数 / 总 token / 总耗时：
  - 单个 agent 详情（任选一个）：prompt 内容 / token：
  - 主对话上下文是否被中间过程污染：
  - 最终报告列出的 bug（file:line:call）：
- 与 ground truth 对齐（协作者填写）：
- 备注：
```

## Ground truth（实验 1，共 6 处）

| file | line | call | function |
|---|---|---|---|
| src/users/authService.ts | 36 | hasPermission | assertCanManage |
| src/pricing/promoCodes.ts | 16 | promoIsStale | applyPromo |
| src/inventory/reservationService.ts | 15 | hasActiveReservation | reserveForOrder |
| src/orders/fulfillmentService.ts | 26 | hasStock | fulfillOrder |
| src/notifications/digestBuilder.ts | 21 | hasDigestBeenSent | buildDigestsFor |
| src/orders/returnsService.ts | 51 | autoApprovalBlocked | autoApproveIfEligible |

---

### RUN-IX-1（实验 1 · WF 臂 · 交互式）
- 日期 / 版本：2026-09-02 / Claude Code v2.1.218，Deepseek-V4-Flash-0731（代理）
- 执行者观察（/workflows 面板截图）：
  - Claude 自写编排脚本，命名 `audit-promise-in-boolean`，描述 "Read-only audit: every TypeScript file under src/ checked for a Promise used directly..."
  - 两个 phase：Audit 24/24 + Merge
  - **24/24 agents，33s，done，全部绿勾**（一文件一 agent）
  - 每 agent ≈19.4k–22.7k tok，全部 Deepseek-V4-Flash-0731
  - 面板底部提供 `s save`（待第 2 步使用）
- 关键发现（协作者验证）：headless 矩阵的 transcript 只记录了 2–5/24 个 agent 的
  usage；有记录者均值 ≈19.0k（input 1.5k + cache_read 17.4k），与面板一致。
  **headless token 聚合被低估，面板为准**（详见 README MEASUREMENT CAVEAT）。
- 与 ground truth 对齐：待执行者回报最终报告的 bug 清单后填写。
- 备注：主对话未见中间过程回流（仅脚本 + 最终报告），待确认。
