import type { BlockNode, InlineNode } from './markdown'
import type { ThemeTokens } from './themes'

const SWISS_KLEIN_ROOT_ID = 'swiss-layout-v2.1'

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(text: string) {
  return escapeHtml(text)
}

function safeUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return '#'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^mailto:/i.test(trimmed)) return trimmed
  if (/^data:image\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('#')) return trimmed
  return '#'
}

function colorToCssRgb(color: string): string {
  const trimmed = color.trim()
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)
  if (!match) return trimmed
  const hex = match[1]?.toLowerCase() ?? ''
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16)
    const g = Number.parseInt(hex[1] + hex[1], 16)
    const b = Number.parseInt(hex[2] + hex[2], 16)
    return `rgb(${r},${g},${b})`
  }
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgb(${r},${g},${b})`
}

function inlinePlainText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.value
        case 'break':
          return ' '
        case 'code':
          return n.value
        case 'strong':
        case 'em':
        case 'underline':
          return inlinePlainText(n.children)
        case 'link':
          return inlinePlainText(n.children)
        case 'image':
          return n.alt
      }
    })
    .join('')
}

function blocksPlainText(blocks: BlockNode[]): string {
  const parts: string[] = []
  blocks.forEach((b) => {
    switch (b.type) {
      case 'blank':
        parts.push('')
        break
      case 'hr':
        parts.push('—')
        break
      case 'heading':
        parts.push(inlinePlainText(b.children))
        break
      case 'paragraph':
        parts.push(inlinePlainText(b.children))
        break
      case 'codeblock':
        parts.push(b.value)
        break
      case 'list':
        b.items.forEach((it) => parts.push(inlinePlainText(it)))
        break
      case 'blockquote':
        parts.push(blocksPlainText(b.children))
        break
      case 'callout':
        parts.push(blocksPlainText(b.children))
        break
    }
  })
  return parts.join('\n').trim()
}

function singleImageFromInlines(nodes: InlineNode[]) {
  let image: InlineNode | null = null
  for (const n of nodes) {
    if (n.type === 'image') {
      if (image) return null
      image = n
      continue
    }
    if (n.type === 'text' && n.value.trim() === '') continue
    if (n.type === 'break') continue
    return null
  }
  return image?.type === 'image' ? image : null
}

function wechatSafeTextStyle(theme: ThemeTokens) {
  const parts = [
    `font-size:${theme.font.size}`,
    `line-height:${theme.font.lineHeight}`,
    `color:${theme.color.text}`,
    'word-break:break-word',
  ]
  if (theme.name === 'klein') parts.push('letter-spacing:2px')
  return parts.join(';')
}

function kleinUnderlineStyle(theme: ThemeTokens) {
  return [
    `font-size:${theme.font.size}`,
    'text-decoration:none',
    `border-bottom:2px solid ${theme.color.link}`,
    'padding-bottom:2px',
    'color:#000',
    'font-weight:500',
  ].join(';')
}

function kleinHardShadowImageStyle(theme: ThemeTokens) {
  return [
    'width:92%',
    'display:block',
    'border:2px solid #000',
    'margin:20px auto',
    `box-shadow:6px 6px 0px ${theme.color.link}`,
  ].join(';')
}

function swissKleinRootStyle(theme: ThemeTokens) {
  const paperColor = theme.name === 'chinese' ? '#fbf7ef' : '#ffffff'
  return [
    `background-color:${paperColor}`,
    `color:${theme.color.text}`,
    `font-size:${theme.font.size}`,
    `line-height:${theme.font.lineHeight}`,
    'letter-spacing:2px',
    'padding:20px 15px',
  ].join(';')
}

function formatSwissKleinChapterTitle(title: string) {
  const trimmed = title.trim()
  let isAscii = true
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 0x7f) {
      isAscii = false
      break
    }
  }
  return isAscii ? trimmed.toUpperCase() : trimmed
}

function formatSwissKleinChapterNumber(index: number) {
  return String(index).padStart(2, '0')
}

export type SwissKleinOptions = {
  metaText: string
  footerText: string
}

function renderSwissKleinMetaHeader(theme: ThemeTokens, metaText: string) {
  const spanStyle = [
    'display:inline-block',
    `background-color:${theme.color.link}`,
    'padding:6px 16px',
    'margin-bottom:40px',
    'color:#fff',
    'font-size:12px',
    'font-weight:700',
    'letter-spacing:2px',
    ...(theme.name === 'chinese'
      ? [`border:1px solid ${theme.color.border}`, `box-shadow:2px 2px 0 ${theme.color.border}`]
      : []),
  ].join(';')
  return `<section style="text-align:center;"><span leaf="" style="${spanStyle}">${escapeHtml(
    metaText,
  )}</span></section>`
}

function renderSwissKleinFooter(theme: ThemeTokens, footerText: string) {
  const footerStyle = [
    'margin-top:80px',
    `border-top:1px solid ${theme.color.border}`,
    'padding-top:40px',
    'text-align:center',
    `color:${theme.color.muted}`,
    'font-size:14px',
  ].join(';')
  const badgeStyle = [
    'display:inline-block',
    'background:#000',
    'color:#fff',
    'padding:4px 12px',
    'font-size:12px',
    'margin-top:20px',
    'font-weight:bold',
  ].join(';')
  return `<section style="${footerStyle}"><span leaf="" style="${badgeStyle}">${escapeHtml(
    footerText,
  )}</span></section>`
}

function renderSwissKleinChapterHeading(
  theme: ThemeTokens,
  chapterIndex: number,
  title: string,
) {
  const titleColor = theme.name === 'chinese' ? theme.color.text : '#000'
  const underlineColor = theme.name === 'chinese' ? theme.color.link : '#000'
  const containerStyle = [
    'margin-top:60px',
    'margin-bottom:30px',
    'display:flex',
    'align-items:baseline',
  ].join(';')
  const numberStyle = [
    'font-size:60px',
    'font-weight:900',
    `color:${theme.color.link}`,
    'line-height:0.8',
    'margin-right:15px',
  ].join(';')
  const titleStyle = [
    `font-size:${theme.heading.h2}`,
    'font-weight:bold',
    `color:${titleColor}`,
    'display:inline-block',
    'padding-bottom:6px',
    `border-bottom:4px solid ${underlineColor}`,
  ].join(';')
  return `<section style="${containerStyle}"><span leaf="" style="${numberStyle}">${escapeHtml(
    formatSwissKleinChapterNumber(chapterIndex),
  )}</span><span leaf="" style="${titleStyle}">/ ${escapeHtml(
    formatSwissKleinChapterTitle(title),
  )}</span></section>`
}

function renderWeChatInlines(nodes: InlineNode[], theme: ThemeTokens): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escapeHtml(n.value)
        case 'break':
          return '<br>'
        case 'code':
          return `<span leaf="" style="font-size:${theme.font.size};background:${theme.color.codeBg};padding:0 4px;border-radius:${theme.radius};">${escapeHtml(
            n.value,
          )}</span>`
        case 'strong': {
          const accent = colorToCssRgb(theme.color.link)
          return `<span style="color:${accent};font-weight:bold;">${renderWeChatInlines(
            n.children,
            theme,
          )}</span>`
        }
        case 'em':
          return `<span leaf="" style="font-size:${theme.font.size};font-style:italic;">${renderWeChatInlines(
            n.children,
            theme,
          )}</span>`
        case 'underline':
          return `<span leaf="" style="${kleinUnderlineStyle(theme)}">${renderWeChatInlines(
            n.children,
            theme,
          )}</span>`
        case 'link': {
          const href = safeUrl(n.href)
          return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer" style="${kleinUnderlineStyle(
            theme,
          )}">${renderWeChatInlines(n.children, theme)}</a>`
        }
        case 'image': {
          const src = safeUrl(n.src)
          const alt = escapeAttribute(n.alt)
          return `<img src="${escapeAttribute(src)}" alt="${alt}" style="${kleinHardShadowImageStyle(
            theme,
          )}">`
        }
      }
    })
    .join('')
}

function renderSwissKleinCallout(
  callout: Extract<BlockNode, { type: 'callout' }>,
  theme: ThemeTokens,
  ctx: { chapterIndex: number },
) {
  const containerStyle = [
    `border:2px solid ${theme.color.link}`,
    'padding:16px 16px',
    'margin:20px 0',
    `background:${theme.color.quoteBg}`,
  ].join(';')
  const titleText =
    callout.title?.trim().length ? callout.title.trim() : callout.kind.toUpperCase()
  const titleStyle = [
    'display:inline-block',
    `background:${theme.color.link}`,
    'color:#fff',
    'padding:4px 10px',
    'font-size:12px',
    'font-weight:700',
    'letter-spacing:2px',
    'margin-bottom:10px',
  ].join(';')

  const bodyLeafStyle = wechatSafeTextStyle(theme)
  const inner = callout.children
    .map((b) => renderSwissKleinWeChatBlock(b, theme, ctx, true))
    .join('')

  return `<section style="${containerStyle}"><section style="margin:0 0 10px;"><span leaf="" style="${titleStyle}">${escapeHtml(
    titleText,
  )}</span></section><section style="${bodyLeafStyle}">${inner}</section></section>`
}

function renderSwissKleinWeChatBlock(
  block: BlockNode,
  theme: ThemeTokens,
  ctx: { chapterIndex: number },
  tight = false,
): string {
  const bodyLeafStyle = wechatSafeTextStyle(theme)
  const paraMargin = tight ? '0 0 16px' : '0 0 16px'

  switch (block.type) {
    case 'blank':
      return '<section style="height:6px;line-height:6px;"></section>'
    case 'hr': {
      const style = tight ? 'margin:12px 0;' : 'margin:20px 0;'
      return `<section style="${style}"><span leaf="" style="display:block;border-top:1px solid ${theme.color.border};height:0;"></span></section>`
    }
    case 'heading': {
      if (block.depth === 2) {
        ctx.chapterIndex += 1
        const title = inlinePlainText(block.children)
        return renderSwissKleinChapterHeading(theme, ctx.chapterIndex, title)
      }

      const depth = Math.min(6, Math.max(1, block.depth))
      const size = depth === 1 ? theme.heading.h1 : depth === 3 ? theme.heading.h3 : theme.heading.h2
      const margin = depth === 1 ? '40px 0 18px' : depth === 3 ? '24px 0 12px' : '30px 0 14px'
      const weight = depth === 1 ? '900' : '800'
      const headingColor = theme.name === 'chinese' ? theme.color.text : '#000'
      return `<section style="margin:${margin};"><span leaf="" style="font-size:${size};font-weight:${weight};color:${headingColor};">${renderWeChatInlines(
        block.children,
        theme,
      )}</span></section>`
    }
    case 'paragraph': {
      const onlyImage = singleImageFromInlines(block.children)
      if (onlyImage) return renderWeChatInlines([onlyImage], theme)
      const sectionStyle = `${bodyLeafStyle};margin:${paraMargin};`
      return `<section style="${sectionStyle}"><span leaf="" style="${bodyLeafStyle}">${renderWeChatInlines(
        block.children,
        theme,
      )}</span></section>`
    }
    case 'codeblock': {
      const containerStyle = [
        `background-color:${theme.color.codeBg}`,
        `border-left:5px solid ${theme.color.link}`,
        'padding:15px',
        'margin:20px 0',
        'border-radius:2px',
      ].join(';')
      const textStyle = [
        "font-family:'Menlo', monospace",
        `font-size:${theme.font.size}`,
        'color:#000',
        'line-height:1.6',
        'overflow-x:auto',
        'white-space:pre-wrap',
        'display:block',
      ].join(';')
      return `<section style="${containerStyle}"><span leaf="" style="${textStyle}">${escapeHtml(
        block.value,
      )}</span></section>`
    }
    case 'list': {
      const itemStyle = [
        bodyLeafStyle,
        'margin:0 0 6px',
        'padding-left:1.2em',
        'text-indent:-1.2em',
      ].join(';')
      return block.items
        .map((it, idx) => {
          const prefix = block.ordered ? `${idx + 1}. ` : '• '
          return `<section style="${itemStyle}"><span leaf="" style="${bodyLeafStyle}">${escapeHtml(
            prefix,
          )}${renderWeChatInlines(it, theme)}</span></section>`
        })
        .join('')
    }
    case 'blockquote': {
      const text = blocksPlainText(block.children)
      const html = escapeHtml(text).replace(/\n/g, '<br>')
      const style = [
        `border:2px solid ${theme.color.link}`,
        'padding:20px',
        `color:${theme.color.link}`,
        'font-weight:bold',
        `font-size:${theme.font.size}`,
        'margin:30px 0',
        `background:${theme.color.quoteBg}`,
      ].join(';')
      const leafStyle = [
        `font-size:${theme.font.size}`,
        `line-height:${theme.font.lineHeight}`,
        'letter-spacing:2px',
        `color:${theme.color.link}`,
        'font-weight:bold',
      ].join(';')
      return `<section style="${style}"><span leaf="" style="${leafStyle}">${html}</span></section>`
    }
    case 'callout':
      return renderSwissKleinCallout(block, theme, ctx)
  }
}

function renderSwissKleinWeChatHtml(
  blocks: BlockNode[],
  theme: ThemeTokens,
  options: SwissKleinOptions,
): string {
  const rootStyle = swissKleinRootStyle(theme)
  const ctx = { chapterIndex: 0 }
  const meta = renderSwissKleinMetaHeader(theme, options.metaText)
  const body = blocks.map((b) => renderSwissKleinWeChatBlock(b, theme, ctx)).join('')
  const footer = renderSwissKleinFooter(theme, options.footerText)
  return `<section id="${SWISS_KLEIN_ROOT_ID}" style="${rootStyle}">${meta}${body}${footer}</section>`
}

export function renderWeChatHtml(
  blocks: BlockNode[],
  theme: ThemeTokens,
  options: SwissKleinOptions,
): string {
  const mpStyleType =
    '<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>'
  return `${renderSwissKleinWeChatHtml(blocks, theme, options)}${mpStyleType}`
}
