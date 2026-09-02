# 复现指南：脚本编排 vs 自然语言编排

本文是 `README.md` 的展开版：每一步的目的（验证什么）、怎么做、预期输出。
所有命令在仓库根目录执行，Windows（Git Bash）/ macOS / Linux 通用。

## 0. 要验证的三个可证伪命题

| # | 命题 | 实验 | 证伪指标 |
|---|------|------|----------|
| ① | 脚本编排确定性更强 | 实验 1（审计） | 交付 recall 轮间方差、报告 Jaccard |
| ② | 子代理上下文精确可控、总 token 更少 | 实验 1 | 主线程 / 子代理 / 全会话三层 token、prompt 模板数 |
| ③ | 复杂任务上 workflow 依然占优 | 实验 2（修到全绿） | 合法成功率、根因命中、作弊率 |

## 1. 环境检查

```bash
claude --version    # 实验用 v2.1.218；v2.1.154 引入 workflows，行为随版本变
node --version      # >= 20
git --version
gh auth status      # 仅推送结果时需要
```

目的：锁定实验对象版本。workflow 的触发行为随版本变化（见第 3 步），不锁版本结果不可比。

## 2. 确认模型配置（公平性前提）

```bash
node -e "const s=require(require('os').homedir()+'/.claude/settings.json'); \
console.log(s.env.ANTHROPIC_MODEL, '|', s.env.CLAUDE_CODE_SUBAGENT_MODEL, '|', s.env.ANTHROPIC_BASE_URL)"
```

目的：两臂唯一允许的变量是编排方式。本次实验环境恰好把所有模型档位（含子代理）
映射到同一个模型，天然消除「模型档位」混淆变量。若你的配置是多档位，请固定
`ANTHROPIC_MODEL` 并在报告中说明。

## 3. Smoke test：触发路径 + 遥测结构（WF 臂生死步）

官方文档称 `-p` 模式不触发 workflow，必须实测（v2.1.218 实测可以触发，
这正是整个实验能无人值守的前提）。

```bash
mkdir -p tmp-smoke/src tmp-smoke/.claude/workflows
cat > tmp-smoke/src/a.ts <<'EOF'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function isAllowed(id: string): Promise<boolean> {
  await sleep(1)
  return id === 'admin'
}
export async function gate(id: string): Promise<string> {
  const ok = isAllowed(id)
  if (!ok) return 'denied'
  return 'granted'
}
EOF
cd tmp-smoke
claude -p "ultracode: use a workflow where a single agent checks src/a.ts for a missing await on the isAllowed call, returning JSON {missingAwait, line}" \
  --dangerously-skip-permissions --output-format json > smokeA.json
ls ~/.claude/projects/*tmp-smoke*/*/
```

验证点：
1. `smokeA.json` 的 result 提到 workflow 完成、找到 line 9 的 missing await；
2. session 目录出现 `subagents/workflows/wf_*/`，含 `agent-*.jsonl`（逐消息
   usage、`isSidechain=true`）、`journal.jsonl`（runtime 流水）、`workflows/wf_*.json`
   （manifest，`script` 字段是 Claude 自己写的脚本原文）。

附带验证：保存的 workflow 用 `/<name>` 在 `-p` 下调用**不**生效（会被当普通文本），
只有 `ultracode` 关键字路径可用。

## 4. 生成 fixture（带标准答案的考场）

```bash
node tools/gen-fixtures.mjs
```

- 从 `fixtures-src/` 复制到 `fixtures/`（考场目录，gitignored）
- 每个考场 `git init -b main` 并打 baseline commit —— 这是 diff 评分与轮间
  重置的锚点
- ground truth 不放进考场（`grading/*.json`），避免 agent 「翻到答案」

exp1：24 个 TS 文件、6 处预埋「async 结果被当布尔值用」、若干合法诱饵
（`void x().catch()`、`Promise.all`、尾 return）。
exp2：6 个跨模块 bug（含 1 条类型错误链）、12 个测试（6 失败 + 6 守卫）。

## 5. 验证 fixture 基线（防作弊关键）

```bash
cd fixtures/exp1-audit && npm i && npx tsc --noEmit && cd ../..   # 必须全绿
cd fixtures/exp2-fix   && npm i && npx vitest run && npx tsc --noEmit && cd ../..
# 预期：6 failed | 6 passed；tsc 恰好 1 个错误（预埋类型链）
```

为什么要这么严：exp1 预埋 bug 最初用 `if (promise)` 正向真值判断，TS2801
直接标红 —— agent 跑一遍 tsc 就能「作弊」找到全部答案。因此所有预埋 bug 必须
是 tsc 不报错的**否定式家族**（`if (!predicate)`，Promise 恒真 → 门禁永不触发）。
exp2 的 1 个 tsc 错误是故意留的类型链，且守卫测试不得引用不存在于类型上的字段
（否则任务无解）。**基线不成立，后面全部白跑。**

## 6. 试跑一轮（管线冒烟 + 成本预估）

```bash
node tools/run-exp1.mjs --runs 1 --arms nl,wf
```

runner 每轮：`git checkout -- . && git clean -fd` 重置考场 → 以考场为 cwd 启动
全新 `claude -p` 会话（prompt 经 stdin 喂入，避免 Windows 参数转义问题）→
按 mtime 捕获 sessionId → 存 `results/exp1/raw/run-<arm>-<n>.json`。

预期（实测参考）：exit=0，NL ≈ 120s / WF ≈ 159s，proxy 计费 ≈ $1.4 / $2.0。
先单轮确认成本可接受再放量。

## 7. 解析 transcript（把会话变成数字）

```bash
node tools/parse-transcripts.mjs --fixture fixtures/exp1-audit --exp exp1 --tag all
```

三个关键正确性设计（都可独立抽查）：
1. **分流**：`isSidechain === true` 的行是子代理；其余是主线程。
2. **去重**：同一 API 响应的多个 content block 共享 `message.id` 且 usage 相同，
   必须按 id 去重（实测去重前后差 ~2.7 倍；同 id 行 usage 完全一致，取首次 = 取末次）。
3. **工件提取**：WF 臂从 `wf_*.json` 取脚本原文；两臂抽子代理 prompt（模板一致性）
   与最终报告；另外导出 `collective.txt`（全部子代理输出拼接），供「集体 recall」评分。

已知测量不对称：Task 子代理（NL 臂）的 usage 在该版本 transcript 中多为 0，
故 NL 总 token 是**下界**——结论只能写成保守形式（见 README）。

## 8. 评分（对答案）

```bash
node tools/grade-exp1.mjs    # results/exp1/summary.md
node tools/grade-exp2.mjs    # results/exp2/summary.md
```

核心设计：**交付 recall**（最终报告里有什么）与**集体 recall**（子代理实际发现了什么）
分开。前者衡量编排者，后者衡量工人。报告缺失时评分器回退到 collective，
避免把「没写报告」误判成「没找到 bug」。

exp2 评分：runner 在每轮结束后自动 `git diff` + 重放 `vitest`/`tsc`，评分器按
`grading/exp2-ground-truth.json` 的作弊模式（改 tests/、加 @ts-ignore、空 catch、
as any）给每个 run 定 `legit-success / cheat / fail`。

## 9. 放量：完整矩阵

```bash
node tools/run-exp1.mjs --runs 5 --arms nl,wf     # ~30 min
node tools/run-exp2.mjs --runs 5 --arms nl        # ~15 min
node tools/run-exp2.mjs --runs 5 --arms wf        # ~50 min
node tools/parse-transcripts.mjs --fixture fixtures/exp1-audit --exp exp1 --tag all
node tools/parse-transcripts.mjs --fixture fixtures/exp2-fix --exp exp2 --tag all
node tools/grade-exp1.mjs && node tools/grade-exp2.mjs
```

- 中断续跑：`--offset 4` 从第 5 轮开始（raw 文件按轮号落盘，不冲突）
- `runs.json` 按 arm 合并，分臂调用不丢数据；若调用被杀，可从
  `raw/run-*.json` 重建（仓库历史里有这个场景的一次性脚本逻辑）

## 10. 画图 + 解读

```bash
node tools/make-charts.mjs    # charts/*.svg → 拷贝到博客 static/images/
```

四张图对应三个命题：点阵图（①确定性）、堆叠条（②token）、结果网格（③成功率）、
双面板（③的代价）。解读要点见博客「实测」一节。

## 已知坑（我们踩过的）

1. `if (promise)` 被 TS2801 抓 → 预埋 bug 必须是否定式家族（第 5 步）
2. Task 子代理 usage 多为 0 → NL token 是下界，结论用保守形式（第 7 步）
3. 超时中断留孤儿 session → 评分按 sessionId join，孤儿不参与；usage-all.json
   里多出的条目属正常噪音
4. fixture 每轮必须重置，否则上一轮修复污染下一轮（runner 自带）
5. `claude -p` 的 prompt 走 stdin，避免 Windows `spawnSync` 参数转义问题
6. 会话被杀时 `runs.json` 未落盘 → 从 raw 重建（第 9 步）
