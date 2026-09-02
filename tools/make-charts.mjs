#!/usr/bin/env node
// Generate the four blog figures as static SVGs (no deps, no CDN).
// Data source: results/exp1/summary.md + results/exp2/summary.md (5x2 matrix).
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'charts')
mkdirSync(OUT, { recursive: true })

const FONT = `-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif`
const INK = '#111827'
const MUTED = '#6B7280'
const GRID = '#E5E7EB'
const NL = '#D97706' // amber-600
const NL_LIGHT = '#FDE68A'
const WF = '#2563EB' // blue-600
const WF_LIGHT = '#BFDBFE'
const OK_BG = '#DCFCE7'
const OK_FG = '#15803D'
const BAD_BG = '#FEE2E2'
const BAD_FG = '#B91C1C'

const W = 660

function svg(height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="${FONT}">
<rect width="${W}" height="${height}" fill="#ffffff"/>
${body}
</svg>`
}

function title(x, y, text) {
  return `<text x="${x}" y="${y}" font-size="15" font-weight="700" fill="${INK}">${text}</text>`
}

function note(x, y, text) {
  return `<text x="${x}" y="${y}" font-size="11.5" fill="${MUTED}">${text}</text>`
}

// ---------- Chart 1: exp1 delivered recall dot strips ----------
{
  const parts = []
  parts.push(title(24, 32, '实验 1 · 交付 recall（5 轮 / 臂）'))
  parts.push(note(24, 50, '1.0 = 最终报告包含全部 6 处预埋 bug；0 = 未交付汇总报告'))
  const x0 = 170, dx = 100
  // y scale: recall 0 → 226, 1 → 96
  const yOf = (r) => 226 - r * 130
  for (const [r, label] of [[0, '0'], [0.5, '0.5'], [1, '1.0']]) {
    const y = yOf(r)
    parts.push(`<line x1="${x0 - 14}" y1="${y}" x2="${x0 + 4 * dx + 22}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`)
    parts.push(`<text x="${x0 - 20}" y="${y + 4}" font-size="11" fill="${MUTED}" text-anchor="end">${label}</text>`)
  }
  const row = (yBase, values, color, name, tagline) => {
    const s = []
    s.push(`<text x="${x0 - 34}" y="${yBase + 5}" font-size="12.5" fill="${INK}" text-anchor="end" font-weight="600">${name}</text>`)
    s.push(`<text x="${x0 - 34}" y="${yBase + 20}" font-size="10.5" fill="${MUTED}" text-anchor="end">${tagline}</text>`)
    values.forEach((v, i) => {
      s.push(`<circle cx="${x0 + i * dx}" cy="${yOf(v)}" r="7.5" fill="${color}" fill-opacity="0.9"/>`)
      s.push(`<text x="${x0 + i * dx}" y="${yOf(v) + 3.5}" font-size="9.5" fill="#ffffff" text-anchor="middle" font-weight="700">${v}</text>`)
    })
    return s.join('\n')
  }
  parts.push(row(128, [1, 0, 1, 1, 0], NL, '自然语言编排', '轮间方差大'))
  parts.push(row(186, [1, 1, 1, 1, 1], WF, 'Workflow', '零方差'))
  for (let i = 0; i < 5; i++) {
    parts.push(`<text x="${x0 + i * dx}" y="248" font-size="10.5" fill="${MUTED}" text-anchor="middle">轮 ${i + 1}</text>`)
  }
  parts.push(note(24, 274, '子代理实际发现（集体 recall）：两臂均 5/5 —— 差距全部出在编排者的交付环节。Jaccard：NL 0.4 / WF 1.0'))
  writeFileSync(join(OUT, 'exp1-recall.svg'), svg(290, parts.join('\n')))
}

// ---------- Chart 2: exp1 tokens stacked bars ----------
{
  const parts = []
  parts.push(title(24, 32, '实验 1 · Token 消耗（5 轮均值）'))
  const x0 = 165, xMax = 620
  const scale = (v) => (v / 380000) * (xMax - x0)
  const bar = (y, main, sub, color, light, name) => {
    const wm = scale(main), ws = scale(sub)
    const s = []
    s.push(`<text x="${x0 - 10}" y="${y + 17}" font-size="12.5" fill="${INK}" text-anchor="end" font-weight="600">${name}</text>`)
    s.push(`<rect x="${x0}" y="${y}" width="${wm}" height="34" fill="${color}" rx="3"/>`)
    s.push(`<rect x="${x0 + wm}" y="${y}" width="${ws}" height="34" fill="${light}" rx="3"/>`)
    s.push(`<text x="${x0 + wm / 2}" y="${y + 21}" font-size="11.5" fill="#ffffff" text-anchor="middle" font-weight="600">主线程 ${main.toLocaleString()}</text>`)
    s.push(`<text x="${x0 + wm + ws / 2}" y="${y + 45}" font-size="10.5" fill="${MUTED}" text-anchor="middle">子代理 ${sub.toLocaleString()}</text>`)
    s.push(`<text x="${x0 + wm + ws + 8}" y="${y + 21}" font-size="12" fill="${INK}" font-weight="700">${(main + sub).toLocaleString()}</text>`)
    return s.join('\n')
  }
  parts.push(bar(72, 369840, 5082, NL, NL_LIGHT, '自然语言'))
  parts.push(bar(148, 229855, 57625, WF, WF_LIGHT, 'Workflow'))
  // reference line: NL grand total
  const refX = x0 + scale(374922)
  parts.push(`<line x1="${refX}" y1="60" x2="${refX}" y2="196" stroke="#B91C1C" stroke-width="1.2" stroke-dasharray="4 3"/>`)
  parts.push(`<text x="${refX + 6}" y="63" font-size="10.5" fill="#B91C1C">NL 全会话</text>`)
  parts.push(note(165, 218, 'Workflow 全会话（287,480）＜ 自然语言仅主线程（369,840）——且 NL 的子代理用量未被该版本 transcript 记录，实际更高'))
  parts.push(note(165, 236, '橙色实心 = 主线程；浅色 = 子代理。数据：exp1 五轮均值'))
  writeFileSync(join(OUT, 'exp1-tokens.svg'), svg(252, parts.join('\n')))
}

// ---------- Chart 3: exp2 outcome grid ----------
{
  const parts = []
  parts.push(title(24, 32, '实验 2 · 每轮结果（6 处根因修到测试全绿 + tsc 干净）'))
  const cellW = 86, cellH = 56, gap = 14, x0 = 168, y0 = 64
  for (let i = 0; i < 5; i++) {
    parts.push(`<text x="${x0 + i * (cellW + gap) + cellW / 2}" y="${y0 - 8}" font-size="10.5" fill="${MUTED}" text-anchor="middle">轮 ${i + 1}</text>`)
  }
  const gridRow = (row, y, values, name) => {
    const s = []
    s.push(`<text x="${x0 - 14}" y="${y + cellH / 2 + 5}" font-size="12.5" fill="${INK}" text-anchor="end" font-weight="600">${name}</text>`)
    values.forEach((v, i) => {
      const x = x0 + i * (cellW + gap)
      const ok = v.ok
      s.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="7" fill="${ok ? OK_BG : BAD_BG}" stroke="${ok ? OK_FG : BAD_FG}" stroke-width="1.2"/>`)
      s.push(`<text x="${x + cellW / 2}" y="${y + 24}" font-size="14" font-weight="800" fill="${ok ? OK_FG : BAD_FG}" text-anchor="middle">${ok ? '✓' : '✗'}</text>`)
      s.push(`<text x="${x + cellW / 2}" y="${y + 43}" font-size="10.5" fill="${ok ? OK_FG : BAD_FG}" text-anchor="middle">根因 ${v.roots}/6</text>`)
    })
    return s.join('\n')
  }
  parts.push(gridRow(0, y0, [
    { ok: true, roots: 6 }, { ok: true, roots: 6 }, { ok: true, roots: 6 }, { ok: false, roots: 2 }, { ok: true, roots: 6 },
  ], '自然语言'))
  parts.push(gridRow(1, y0 + cellH + 18, [
    { ok: true, roots: 6 }, { ok: true, roots: 6 }, { ok: true, roots: 6 }, { ok: true, roots: 6 }, { ok: true, roots: 6 },
  ], 'Workflow'))
  const y2 = y0 + 2 * cellH + 18
  parts.push(note(24, y2 + 26, '合法成功 = 测试全绿 + tsc 干净 + 未改测试。两臂作弊率均为 0；所有成功轮的 diff 均为 +6/-6 外科手术式修复'))
  writeFileSync(join(OUT, 'exp2-outcome.svg'), svg(y2 + 40, parts.join('\n')))
}

// ---------- Chart 4: exp2 tradeoff ----------
{
  const parts = []
  parts.push(title(24, 32, '实验 2 · 收益与代价（5 轮均值）'))
  const baseY = 218, maxH = 140
  // panel A: duration
  {
    const x0 = 150, bw = 74
    parts.push(`<text x="${x0 + 60}" y="62" font-size="12.5" fill="${INK}" font-weight="600" text-anchor="middle">耗时（秒）</text>`)
    const dNL = 166, dWF = 757
    const hA = (v) => (v / 800) * maxH
    parts.push(`<rect x="${x0}" y="${baseY - hA(dNL)}" width="${bw}" height="${hA(dNL)}" fill="${NL}" rx="3"/>`)
    parts.push(`<text x="${x0 + bw / 2}" y="${baseY - hA(dNL) - 7}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="700">166</text>`)
    parts.push(`<rect x="${x0 + bw + 26}" y="${baseY - hA(dWF)}" width="${bw}" height="${hA(dWF)}" fill="${WF}" rx="3"/>`)
    parts.push(`<text x="${x0 + bw + 26 + bw / 2}" y="${baseY - hA(dWF) - 7}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="700">757</text>`)
    parts.push(`<text x="${x0 + bw / 2}" y="${baseY + 18}" font-size="11" fill="${MUTED}" text-anchor="middle">自然语言</text>`)
    parts.push(`<text x="${x0 + bw + 26 + bw / 2}" y="${baseY + 18}" font-size="11" fill="${MUTED}" text-anchor="middle">Workflow</text>`)
  }
  // divider
  parts.push(`<line x1="375" y1="70" x2="375" y2="${baseY + 24}" stroke="${GRID}" stroke-width="1"/>`)
  // panel B: tokens
  {
    const x0 = 425, bw = 74
    parts.push(`<text x="${x0 + 60}" y="62" font-size="12.5" fill="${INK}" font-weight="600" text-anchor="middle">全会话 token</text>`)
    const tNL = 468392, tWF = 499570
    const hB = (v) => (v / 520000) * maxH
    parts.push(`<rect x="${x0}" y="${baseY - hB(tNL)}" width="${bw}" height="${hB(tNL)}" fill="${NL}" rx="3"/>`)
    parts.push(`<text x="${x0 + bw / 2}" y="${baseY - hB(tNL) - 7}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="700">46.8 万</text>`)
    parts.push(`<rect x="${x0 + bw + 26}" y="${baseY - hB(tWF)}" width="${bw}" height="${hB(tWF)}" fill="${WF}" rx="3"/>`)
    parts.push(`<text x="${x0 + bw + 26 + bw / 2}" y="${baseY - hB(tWF) - 7}" font-size="12" fill="${INK}" text-anchor="middle" font-weight="700">50.0 万</text>`)
    parts.push(`<text x="${x0 + bw / 2}" y="${baseY + 18}" font-size="11" fill="${MUTED}" text-anchor="middle">自然语言</text>`)
    parts.push(`<text x="${x0 + bw + 26 + bw / 2}" y="${baseY + 18}" font-size="11" fill="${MUTED}" text-anchor="middle">Workflow</text>`)
  }
  parts.push(`<line x1="24" y1="${baseY}" x2="636" y2="${baseY}" stroke="${GRID}" stroke-width="1"/>`)
  parts.push(note(24, 262, 'Workflow 用 3–4 倍耗时、约 +7% token，换 100% 合法成功率（NL 4/5，失败轮 2/6 根因后放弃）'))
  writeFileSync(join(OUT, 'exp2-tradeoff.svg'), svg(278, parts.join('\n')))
}

console.log('charts written to charts/')
