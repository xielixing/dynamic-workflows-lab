# dynamic-workflows-lab

博客文章[《Dynamic Workflows》](https://xielixing.github.io/)的实证配套仓库——
两组对照实验，比较**脚本编排**（Claude Code 动态 workflow）与**自然语言编排**
（Claude 在主线程中逐轮唤起子代理）两种方式。

## 实验

| # | 任务 | 验证方式 | 假设 |
|---|------|----------|------|
| 1 | 审计 24 个 TS 文件，找出预埋的 bug 模式（6 个文件命中） | 标准答案清单 | workflow 在确定性（交付 recall 的轮间方差）、单代理上下文精确度、总 token 上更优 |
| 2 | 修复跨 3 个模块的失败测试套件，迭代到全绿 | `npm test` 退出码 | 在复杂多轮任务上 workflow 依然占优；对抗式验证能压低「作弊率」 |

两臂使用同一模型（单模型代理配置）、同一 fixture，每轮一个全新会话，每臂 n=5。

## 目录结构

```
fixtures-src/          # 两个 fixture 的受版本控制源头
  exp1-audit/          # 24 个文件的 TS 仓库，预埋 6 处 missing await
  exp2-fix/            # 带失败测试 + 预埋根因的仓库
fixtures/              # 由 tools/gen-fixtures.mjs 生成（已 gitignore，各自独立 git 仓库）
tools/                 # 生成器、runner、transcript 解析器、评分器
prompts/               # 各臂、各实验的原始 prompt
grading/               # 标准答案 + 作弊模式规则
results/               # 每轮产物 + 汇总指标（原始 transcript 已 gitignore）
```

## 复现

```bash
node tools/gen-fixtures.mjs        # 生成 fixture 与 baseline commit
node tools/run-exp1.mjs            # 经 `claude -p` 跑 5 轮 NL 臂 + 5 轮 WF 臂
node tools/parse-transcripts.mjs   # 从 ~/.claude/projects 统计 token
node tools/grade-exp1.mjs          # 覆盖率 / recall / 精确率 / Jaccard
```

## 测量说明

- token 数来自 `~/.claude/projects/<munged-cwd>/<session-uuid>.jsonl`
  （`message.usage`），按主线程行与子代理行（`isSidechain`）分流统计。
- workflow 遥测位于 `<session-dir>/subagents/workflows/wf_*/`：
  逐代理 transcript、`journal.jsonl`，以及 `wf_*.json`（内含生成的脚本原文）。
- workflow 臂的触发路径：在 `claude -p` 中使用 `ultracode:` 关键字（已在 Claude Code
  v2.1.218 实测可用；文档中「`-p` 永不触发 workflow」的说法在这个版本上已过时）。

## 诚实声明

每臂 n=5，单机，合成 fixture，代理后面只有一个模型。
这是为博客文章提供的工程级证据，不是论文。负面与不确定的结论都如实呈现。

## 测量警示（2026-09-02 交互式复核时发现）

Claude Code 的 transcript 对**两臂的子代理 token 用量都存在少记**：
- workflow 子代理：每轮 24 个代理里只有 2–5 个记录了 usage（同一代理要么全记要么全不记）。
  确实记录的代理平均约 19.0k tokens（input ≈1.5k + cache_read ≈17.4k），
  与 `/workflows` 面板（每代理约 19.4k–22.7k）吻合。
- Task 子代理（NL 臂）：usage 几乎总是 0。

因此 `results/*/summary.md` 里的 `meanGrandTokens` / `meanSubTokens` 汇总是**低估值**，
在重新测量之前，无人值守场景下的 token 结论**撤回**。`/workflows` 面板才是每代理用量的
权威来源。确定性 / 成功率 / 作弊指标基于内容，不受影响。交互式复核进行中：
见 `results/interactive/run-log.md`。
