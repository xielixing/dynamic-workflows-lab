#!/usr/bin/env node
// Generate fixtures from fixtures-src/ into fixtures/ and create a git
// baseline commit in each so graders can diff against a pristine state.
import { cpSync, existsSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'fixtures-src')
const DST = join(ROOT, 'fixtures')
const SKIP = new Set(['node_modules'])

if (!existsSync(SRC)) {
  console.error('no fixtures-src/ found')
  process.exit(1)
}

for (const name of readdirSync(SRC)) {
  const src = join(SRC, name)
  const dst = join(DST, name)
  mkdirSync(dst, { recursive: true })

  // refresh tracked content, keep node_modules and .git intact
  for (const entry of readdirSync(src)) {
    if (SKIP.has(entry)) continue
    const from = join(src, entry)
    const to = join(dst, entry)
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true })
  }

  // baseline git repo
  const git = (cmd) => execSync(cmd, { cwd: dst, stdio: 'pipe' })
  if (!existsSync(join(dst, '.git'))) {
    git('git init -b main')
  }
  git('git add -A')
  try {
    git('git commit -m "baseline" --allow-empty')
  } catch {
    /* nothing to commit */
  }
  console.log(`fixture ready: ${dst}`)
}

// results dir template
const results = join(ROOT, 'results')
for (const d of ['exp1', 'exp2']) {
  mkdirSync(join(results, d, 'raw'), { recursive: true })
}
writeFileSync(join(results, '.gitkeep'), '')
console.log('results dirs ready')
