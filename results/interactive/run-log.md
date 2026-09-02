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
