export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'break' }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'underline'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'image'; src: string; alt: string }

export type BlockNode =
  | { type: 'blank' }
  | { type: 'hr' }
  | { type: 'heading'; depth: number; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'codeblock'; lang?: string; value: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'blockquote'; children: BlockNode[] }
  | { type: 'callout'; kind: string; title?: string; children: BlockNode[] }

function isBlankLine(line: string) {
  return line.trim().length === 0
}

function isHrLine(line: string) {
  const trimmed = line.trim()
  if (trimmed.length < 3) return false
  return /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
}

function isHeadingLine(line: string) {
  return /^#{1,6}\s+/.test(line)
}

function isFenceLine(line: string) {
  return /^```/.test(line.trim())
}

function isQuoteLine(line: string) {
  return /^>\s?/.test(line)
}

function isListLine(line: string) {
  return /^(\s*)([-*+])\s+/.test(line) || /^(\s*)\d+\.\s+/.test(line)
}

function isBlockStart(line: string) {
  if (isBlankLine(line)) return true
  if (isFenceLine(line)) return true
  if (isHeadingLine(line)) return true
  if (isHrLine(line)) return true
  if (isQuoteLine(line)) return true
  if (isListLine(line)) return true
  return false
}

function findNext(source: string, token: string, from: number) {
  const index = source.indexOf(token, from)
  return index === -1 ? null : index
}

function parseLinkLike(
  source: string,
  start: number,
): { ok: false } | { ok: true; end: number; text: string; href: string } {
  const openBracket = source.indexOf('[', start)
  if (openBracket !== start) return { ok: false }
  const closeBracket = findNext(source, ']', start + 1)
  if (closeBracket == null) return { ok: false }
  if (source[closeBracket + 1] !== '(') return { ok: false }
  const closeParen = findNext(source, ')', closeBracket + 2)
  if (closeParen == null) return { ok: false }
  const text = source.slice(start + 1, closeBracket)
  const href = source.slice(closeBracket + 2, closeParen).trim()
  return { ok: true, end: closeParen + 1, text, href }
}

export function parseInlines(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let index = 0

  const pushText = (value: string) => {
    if (!value) return
    const previous = nodes[nodes.length - 1]
    if (previous?.type === 'text') {
      previous.value += value
      return
    }
    nodes.push({ type: 'text', value })
  }

  while (index < source.length) {
    if (source.startsWith('<u>', index)) {
      const end = source.indexOf('</u>', index + 3)
      if (end !== -1) {
        const inner = source.slice(index + 3, end)
        nodes.push({ type: 'underline', children: parseInlines(inner) })
        index = end + 4
        continue
      }
    }

    if (source.startsWith('![', index)) {
      const parsed = parseLinkLike(source, index + 1)
      if (parsed.ok) {
        nodes.push({ type: 'image', alt: parsed.text, src: parsed.href })
        index = parsed.end
        continue
      }
    }

    if (source[index] === '[') {
      const parsed = parseLinkLike(source, index)
      if (parsed.ok) {
        nodes.push({
          type: 'link',
          href: parsed.href,
          children: parseInlines(parsed.text),
        })
        index = parsed.end
        continue
      }
    }

    if (source[index] === '`') {
      const next = findNext(source, '`', index + 1)
      if (next != null) {
        const value = source.slice(index + 1, next)
        nodes.push({ type: 'code', value })
        index = next + 1
        continue
      }
    }

    if (source.startsWith('**', index)) {
      const next = findNext(source, '**', index + 2)
      if (next != null) {
        const value = source.slice(index + 2, next)
        nodes.push({ type: 'strong', children: parseInlines(value) })
        index = next + 2
        continue
      }
    }

    if (source[index] === '*') {
      const next = findNext(source, '*', index + 1)
      if (next != null) {
        const value = source.slice(index + 1, next)
        nodes.push({ type: 'em', children: parseInlines(value) })
        index = next + 1
        continue
      }
    }

    const nextSpecials = ['<u>', '![', '[', '`', '**', '*']
      .map((t) => {
        const nextIndex = source.indexOf(t, index)
        return nextIndex === -1 ? null : nextIndex
      })
      .filter((n): n is number => n != null)

    const nextIndex = nextSpecials.length ? Math.min(...nextSpecials) : -1
    if (nextIndex === -1 || nextIndex === index) {
      pushText(source[index])
      index += 1
      continue
    }

    pushText(source.slice(index, nextIndex))
    index = nextIndex
  }

  return nodes
}

function parseCalloutHeader(line: string) {
  const match = /^\[!([^\]\s]+)\][+-]?\s*(.*)$/.exec(line.trim())
  if (!match) return null
  const kind = match[1]?.toLowerCase()
  const rawTitle = match[2]?.trim() ?? ''
  return { kind, title: rawTitle.length ? rawTitle : undefined }
}

export function parseMarkdown(markdown: string): BlockNode[] {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const blocks: BlockNode[] = []

  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (isBlankLine(line)) {
      blocks.push({ type: 'blank' })
      index += 1
      continue
    }

    if (isFenceLine(line)) {
      const fence = line.trim()
      const lang = fence.slice(3).trim() || undefined
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && !isFenceLine(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length && isFenceLine(lines[index] ?? '')) {
        index += 1
      }
      blocks.push({ type: 'codeblock', lang, value: codeLines.join('\n') })
      continue
    }

    if (isHrLine(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (isHeadingLine(line)) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line)
      const depth = match ? match[1].length : 1
      const content = match ? match[2] : line.replace(/^#+\s+/, '')
      blocks.push({ type: 'heading', depth, children: parseInlines(content) })
      index += 1
      continue
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && isQuoteLine(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }

      const header = quoteLines.length ? parseCalloutHeader(quoteLines[0] ?? '') : null
      if (header) {
        const rest = quoteLines.slice(1).join('\n')
        blocks.push({
          type: 'callout',
          kind: header.kind,
          title: header.title,
          children: parseMarkdown(rest),
        })
        continue
      }

      blocks.push({ type: 'blockquote', children: parseMarkdown(quoteLines.join('\n')) })
      continue
    }

    if (isListLine(line)) {
      const ordered = /^(\s*)\d+\.\s+/.test(line)
      const items: InlineNode[][] = []

      while (index < lines.length && isListLine(lines[index] ?? '')) {
        const itemLine = lines[index] ?? ''
        const content = ordered
          ? itemLine.replace(/^(\s*)\d+\.\s+/, '')
          : itemLine.replace(/^(\s*)([-*+])\s+/, '')
        items.push(parseInlines(content))
        index += 1
      }

      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && !isBlankLine(lines[index] ?? '')) {
      const current = lines[index] ?? ''
      if (paragraphLines.length && isBlockStart(current)) break
      paragraphLines.push(current)
      index += 1
    }

    const children: InlineNode[] = []
    paragraphLines.forEach((l, idx) => {
      children.push(...parseInlines(l))
      if (idx !== paragraphLines.length - 1) children.push({ type: 'break' })
    })
    blocks.push({ type: 'paragraph', children })
  }

  return blocks
}

