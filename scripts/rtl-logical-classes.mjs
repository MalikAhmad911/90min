/**
 * RTL codemod: rewrites physical Tailwind classes to logical ones so the
 * layout mirrors under <html dir="rtl"> (Urdu) with no `rtl:` duplicates.
 *
 *   node scripts/rtl-logical-classes.mjs --dry-run components app   (default)
 *   node scripts/rtl-logical-classes.mjs --write   components app
 *
 * Scope, on purpose: only string literals inside a `className=` attribute or a
 * cn()/clsx()/classNames()/twMerge()/cva() call are touched, and only when
 * every token in the literal looks like a Tailwind class. Text, aria labels,
 * comparisons ('left' === side) and partial dynamic tokens (`ml-${n}`) are
 * left alone; physical tokens found elsewhere are reported, not rewritten.
 * Newlines are never added or removed, so diffs stay line-aligned.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** [pattern on the utility (sign stripped), replacement]. */
export const RULES = [
  [/^ml-(.+)$/, 'ms-$1'],
  [/^mr-(.+)$/, 'me-$1'],
  [/^pl-(.+)$/, 'ps-$1'],
  [/^pr-(.+)$/, 'pe-$1'],
  [/^scroll-ml-(.+)$/, 'scroll-ms-$1'],
  [/^scroll-mr-(.+)$/, 'scroll-me-$1'],
  [/^scroll-pl-(.+)$/, 'scroll-ps-$1'],
  [/^scroll-pr-(.+)$/, 'scroll-pe-$1'],
  [/^left-(.+)$/, 'start-$1'],
  [/^right-(.+)$/, 'end-$1'],
  [/^text-left$/, 'text-start'],
  [/^text-right$/, 'text-end'],
  [/^float-left$/, 'float-start'],
  [/^float-right$/, 'float-end'],
  [/^clear-left$/, 'clear-start'],
  [/^clear-right$/, 'clear-end'],
  [/^rounded-tl(-.+)?$/, 'rounded-ss$1'],
  [/^rounded-tr(-.+)?$/, 'rounded-se$1'],
  [/^rounded-bl(-.+)?$/, 'rounded-es$1'],
  [/^rounded-br(-.+)?$/, 'rounded-ee$1'],
  [/^rounded-l(-.+)?$/, 'rounded-s$1'],
  [/^rounded-r(-.+)?$/, 'rounded-e$1'],
  [/^border-l(-.+)?$/, 'border-s$1'],
  [/^border-r(-.+)?$/, 'border-e$1'],
]

/** Physical utilities with no logical twin in Tailwind 3.4: reported for manual review. */
const REVIEW = [
  [/^space-x-/, 'add rtl:space-x-reverse (space-x uses margin-left/right in Tailwind 3.4)'],
  [/^divide-x/, 'add rtl:divide-x-reverse'],
  [/^bg-gradient-to-(l|r|tl|tr|bl|br)$/, 'gradient direction does not mirror'],
  [/^origin-.*(left|right)/, 'transform origin does not mirror'],
  [/^translate-x-/, 'translate-x does not mirror (add rtl:-translate-x-…)'],
]

const TAILWIND_TOKEN = /^[a-z0-9!@\-:[\]/.%#_(),&>*+~='"]+$/i
const LOOKS_LIKE_CLASS = /^!?-?[a-z@[]/

function splitVariants(token) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === ':' && depth === 0) {
      parts.push(token.slice(start, i))
      start = i + 1
    }
  }
  parts.push(token.slice(start))
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] }
}

/** Rewrites one class token, or returns null when it has nothing to change. */
export function transformToken(token) {
  const { variants, utility } = splitVariants(token)
  if (variants.some((v) => v === 'rtl' || v === 'ltr')) return null
  const m = /^(!?)(-?)(.*)$/.exec(utility)
  const [, important, negative, base] = m
  for (const [pattern, replacement] of RULES) {
    if (pattern.test(base)) {
      const next = base.replace(pattern, replacement)
      return [...variants, `${important}${negative}${next}`].join(':')
    }
  }
  return null
}

function reviewReason(token) {
  const { variants, utility } = splitVariants(token)
  if (variants.some((v) => v === 'rtl' || v === 'ltr')) return null
  const base = utility.replace(/^!?-?/, '')
  if (/^translate-x-1\/2$/.test(base)) return null // centring partner, handled below
  for (const [pattern, reason] of REVIEW) if (pattern.test(base)) return reason
  return null
}

/**
 * Transforms a whitespace-separated class list. `openStart` / `openEnd` mark
 * a template-literal chunk glued to an interpolation, whose edge tokens are
 * partial (`ml-${n}`) and must not be rewritten.
 */
export function transformClassList(value, { openStart = false, openEnd = false } = {}) {
  const changes = []
  const review = []
  const tokens = value.split(/(\s+)/)
  const words = tokens.filter((t) => t && !/^\s+$/.test(t))
  if (words.length === 0) return { value, changes, review }
  // Not a class list (prose, a URL, a comparison operand): leave it alone.
  if (!words.every((w) => TAILWIND_TOKEN.test(w) && LOOKS_LIKE_CLASS.test(w))) {
    return { value, changes, review }
  }
  const centred = words.some((w) => /(^|:)-?translate-x-1\/2$/.test(w))
  const firstWord = tokens.findIndex((t) => t && !/^\s+$/.test(t))
  let lastWord = -1
  tokens.forEach((t, i) => {
    if (t && !/^\s+$/.test(t)) lastWord = i
  })

  const out = tokens.map((tok, i) => {
    if (!tok || /^\s+$/.test(tok)) return tok
    if ((openStart && i === firstWord) || (openEnd && i === lastWord)) {
      if (transformToken(tok) || transformToken(tok + '1')) review.push({ token: tok, reason: 'dynamic class fragment; rewrite by hand' })
      return tok
    }
    const base = splitVariants(tok).utility.replace(/^!?-?/, '')
    if (centred && /^(left|right)-1\/2$/.test(base)) {
      review.push({ token: tok, reason: 'centred with -translate-x-1/2; keep physical (mirroring would shift it)' })
      return tok
    }
    const next = transformToken(tok)
    if (next) {
      changes.push({ from: tok, to: next })
      return next
    }
    const reason = reviewReason(tok)
    if (reason) review.push({ token: tok, reason })
    return tok
  })
  return { value: out.join(''), changes, review }
}

// ── Source scanning ────────────────────────────────────────────────────────


/** Index just past the string/template starting at `i` (quote char at i). */
function skipString(code, i) {
  const q = code[i]
  let j = i + 1
  while (j < code.length) {
    const c = code[j]
    if (c === '\\') j += 2
    else if (c === q) return j + 1
    else if (q === '`' && c === '$' && code[j + 1] === '{') j = skipBalanced(code, j + 1) + 1
    else j++
  }
  return j
}

/** Index of the bracket closing the one at `i` ({ or (), skipping strings and comments. */
function skipBalanced(code, i) {
  const open = code[i]
  const close = open === '{' ? '}' : ')'
  let depth = 0
  let j = i
  while (j < code.length) {
    const c = code[j]
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(code, j)
      continue
    }
    if (c === '/' && code[j + 1] === '/') {
      j = code.indexOf('\n', j)
      if (j === -1) return code.length
      continue
    }
    if (c === '/' && code[j + 1] === '*') {
      j = code.indexOf('*/', j) + 2
      continue
    }
    if (c === open) depth++
    else if (c === close && --depth === 0) return j
    j++
  }
  return code.length - 1
}

/** Rewrites every class-like string literal inside an expression range. */
function transformExpression(code, start, end, acc) {
  let out = ''
  let j = start
  while (j < end) {
    const c = code[j]
    if (c === '"' || c === "'") {
      const stop = skipString(code, j)
      const r = transformClassList(code.slice(j + 1, stop - 1))
      acc.push(r)
      out += c + r.value + c
      j = stop
    } else if (c === '`') {
      const stop = skipString(code, j)
      out += transformTemplate(code, j, stop, acc)
      j = stop
    } else if (c === '/' && code[j + 1] === '/') {
      const nl = code.indexOf('\n', j)
      const stop = nl === -1 || nl > end ? end : nl
      out += code.slice(j, stop)
      j = stop
    } else if (c === '/' && code[j + 1] === '*') {
      const stop = Math.min(code.indexOf('*/', j) + 2, end)
      out += code.slice(j, stop)
      j = stop
    } else {
      out += c
      j++
    }
  }
  return out
}

function transformTemplate(code, start, stop, acc) {
  let out = '`'
  let j = start + 1
  let chunkStart = j
  let afterExpr = false
  const flush = (to, beforeExpr) => {
    const r = transformClassList(code.slice(chunkStart, to), {
      openStart: afterExpr && !/^\s/.test(code.slice(chunkStart, to)),
      openEnd: beforeExpr && !/\s$/.test(code.slice(chunkStart, to)),
    })
    acc.push(r)
    out += r.value
  }
  while (j < stop - 1) {
    if (code[j] === '\\') {
      j += 2
      continue
    }
    if (code[j] === '$' && code[j + 1] === '{') {
      flush(j, true)
      const close = skipBalanced(code, j + 1)
      out += '${' + transformExpression(code, j + 2, close, acc) + '}'
      j = close + 1
      chunkStart = j
      afterExpr = true
      continue
    }
    j++
  }
  flush(stop - 1, false)
  return out + '`'
}

/** Transforms a whole source file. Returns the new code plus what changed. */
export function transformSource(code) {
  const acc = []
  let out = ''
  let i = 0
  const attr = /\bclassName\s*=\s*/g
  while (i < code.length) {
    attr.lastIndex = i
    const m = attr.exec(code)
    // Also catch cn( / clsx( calls between here and the next className.
    const callRe = /\b(?:cn|clsx|classNames|twMerge|cva)\s*\(/g
    callRe.lastIndex = i
    const call = callRe.exec(code)
    const next = [m && { kind: 'attr', at: m.index, end: m.index + m[0].length }, call && { kind: 'call', at: call.index, end: call.index + call[0].length }]
      .filter(Boolean)
      .sort((a, b) => a.at - b.at)[0]
    if (!next) break
    out += code.slice(i, next.end)
    let j = next.end
    if (next.kind === 'call') {
      const close = skipBalanced(code, j - 1)
      out += transformExpression(code, j, close, acc)
      i = close
      continue
    }
    const c = code[j]
    if (c === '"' || c === "'") {
      const stop = skipString(code, j)
      const r = transformClassList(code.slice(j + 1, stop - 1))
      acc.push(r)
      out += c + r.value + c
      i = stop
    } else if (c === '{') {
      const close = skipBalanced(code, j)
      out += '{' + transformExpression(code, j + 1, close, acc)
      i = close
    } else {
      i = j
    }
  }
  out += code.slice(i)
  return {
    code: out,
    changes: acc.flatMap((r) => r.changes),
    review: acc.flatMap((r) => r.review),
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

const EXTENSIONS = /\.(tsx|jsx|ts|js)$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vite-cache'])

function walk(path, files = []) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) if (!SKIP_DIRS.has(entry)) walk(join(path, entry), files)
  } else if (EXTENSIONS.test(path)) files.push(path)
  return files
}

function lineDiff(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  const lines = []
  a.forEach((line, i) => {
    if (line !== b[i]) lines.push(`  ${i + 1}:\n  - ${line.trim()}\n  + ${b[i].trim()}`)
  })
  return lines.join('\n')
}

function main(argv) {
  const write = argv.includes('--write')
  const paths = argv.filter((a) => !a.startsWith('--'))
  const roots = paths.length ? paths : ['components', 'app']
  const files = roots.flatMap((r) => walk(r))
  const counts = new Map()
  const reviews = []
  let changedFiles = 0

  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const { code, changes, review } = transformSource(before)
    const rel = relative(process.cwd(), file).replace(/\\/g, '/')
    review.forEach((r) => reviews.push(`${rel}: ${r.token} - ${r.reason}`))
    if (code === before) continue
    changedFiles++
    for (const c of changes) {
      const rule = `${c.from} -> ${c.to}`
      counts.set(rule, (counts.get(rule) ?? 0) + 1)
    }
    if (write) writeFileSync(file, code)
    else console.log(`--- ${rel} (${changes.length} change${changes.length === 1 ? '' : 's'})\n${lineDiff(before, code)}\n`)
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  console.log(`\n${write ? 'Rewrote' : 'Would rewrite'} ${total} class(es) in ${changedFiles} of ${files.length} file(s).`)
  for (const [rule, n] of [...counts].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${rule}`)
  if (reviews.length) {
    console.log(`\nLeft for manual review (${reviews.length}):`)
    reviews.forEach((r) => console.log(`  ${r}`))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
