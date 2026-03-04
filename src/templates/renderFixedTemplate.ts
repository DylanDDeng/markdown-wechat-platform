import { parseMarkdown, type BlockNode, type InlineNode } from '../core/markdown'
import { getFixedTemplateById, UNIFIED_IMAGE_STYLE, type FixedTemplateId } from './fixedTemplates'

const REQUIRED_MP_STYLE_TAG =
  '<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>'

type RenderFixedTemplateParams = {
  templateId: FixedTemplateId
  title: string
  markdown: string
  customCss: string
}

type TemplateStyles = {
  root: string
  titleWrap: string
  title: string
  paragraph: string
  heading: Record<number, string>
  list: string
  listItem: string
  hr: string
  inlineCode: string
  codeBlock: string
  codeBlockInner: string
  strong: string
  em: string
  underline: string
  link: string
  blank: string
  blockquote: string
  callout: string
  calloutTitle: string
  figure: string
  figcaption: string
  imageInline: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeCustomCss(css: string): string {
  if (!css.trim().length) return ''
  const withoutTag = css.replace(/<\/?style[^>]*>/gi, '').trim()
  if (!withoutTag.length) return ''
  return withoutTag.replace(/<\/style/gi, '<\\/style')
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

function safeHref(href: string): string {
  const value = href.trim()
  if (!value.length) return '#'
  const lower = value.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html')
  ) {
    return '#'
  }
  return value
}

function splitInlineLines(nodes: InlineNode[]): InlineNode[][] {
  const lines: InlineNode[][] = [[]]
  nodes.forEach((node) => {
    if (node.type === 'break') {
      lines.push([])
      return
    }
    lines[lines.length - 1]?.push(node)
  })
  return lines
}

function isImageOnlyLine(nodes: InlineNode[]): nodes is Array<Extract<InlineNode, { type: 'image' }>> {
  if (!nodes.length) return false
  return nodes.every((node) => node.type === 'image')
}

function buildTemplateStyles(templateId: FixedTemplateId): TemplateStyles {
  const template = getFixedTemplateById(templateId)
  const palette = template.palette

  const headingCommon = `margin:30px 0 12px;line-height:1.45;font-weight:700;color:${palette.accent};`

  return {
    root: `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;background:${palette.background};color:${palette.text};font-size:15px;line-height:1.9;max-width:700px;margin:0 auto;padding:24px 20px;border:1px solid ${palette.border};border-radius:16px;`,
    titleWrap: `margin:0 0 24px;padding:0 0 14px;border-bottom:1px solid ${palette.border};`,
    title: `margin:0;font-size:28px;line-height:1.35;font-weight:700;letter-spacing:-0.2px;color:${palette.accent};`,
    paragraph: `margin:0 0 16px;color:${palette.text};font-size:15px;line-height:1.9;`,
    heading: {
      1: `${headingCommon}font-size:26px;`,
      2: `${headingCommon}font-size:22px;padding-left:10px;border-left:4px solid ${palette.accent};`,
      3: `${headingCommon}font-size:19px;`,
      4: `${headingCommon}font-size:17px;color:${palette.text};`,
      5: `${headingCommon}font-size:16px;color:${palette.text};`,
      6: `${headingCommon}font-size:15px;color:${palette.muted};`,
    },
    list: `margin:0 0 18px;padding-left:24px;color:${palette.text};`,
    listItem: `margin:0 0 8px;line-height:1.85;`,
    hr: `margin:26px 0;border:0;border-top:1px solid ${palette.border};`,
    inlineCode: `font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:13px;padding:1px 6px;border-radius:5px;background:${palette.accentSoft};color:${palette.accent};border:1px solid ${palette.border};`,
    codeBlock: `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border:1px solid ${palette.codeBorder};border-radius:12px;overflow-x:auto;`,
    codeBlockInner:
      "font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:13px;line-height:1.75;color:#111827;white-space:pre;",
    strong: `color:${palette.accent};font-weight:700;`,
    em: `color:${palette.text};font-style:italic;`,
    underline: `text-decoration:underline;text-decoration-color:${palette.accent};text-decoration-thickness:1.5px;text-underline-offset:2px;`,
    link: `color:${palette.accent};text-decoration:underline;text-underline-offset:2px;`,
    blank: 'margin:0;height:14px;line-height:14px;',
    blockquote: `margin:22px 0;padding:12px 14px 12px 16px;border-left:4px solid ${palette.quoteBorder};background:${palette.quoteBackground};border-radius:0 10px 10px 0;`,
    callout: `margin:22px 0;padding:14px 16px;background:${palette.accentSoft};border:1px solid ${palette.border};border-radius:12px;`,
    calloutTitle: `margin:0 0 8px;font-size:13px;line-height:1.5;letter-spacing:0.5px;font-weight:700;color:${palette.accent};text-transform:uppercase;`,
    figure: `margin:22px 0;`,
    figcaption: `margin:10px 0 0;color:${palette.muted};font-size:13px;line-height:1.7;text-align:center;`,
    imageInline: `max-width:100%;height:auto;border-radius:14px;box-shadow:0 14px 30px rgba(15,23,42,0.16);vertical-align:middle;`,
  }
}

function renderInlineNodes(nodes: InlineNode[], styles: TemplateStyles): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.value)
        case 'break':
          return '<br />'
        case 'code':
          return `<code style="${styles.inlineCode}">${escapeHtml(node.value)}</code>`
        case 'strong':
          return `<strong style="${styles.strong}">${renderInlineNodes(node.children, styles)}</strong>`
        case 'em':
          return `<em style="${styles.em}">${renderInlineNodes(node.children, styles)}</em>`
        case 'underline':
          return `<span style="${styles.underline}">${renderInlineNodes(node.children, styles)}</span>`
        case 'link':
          return `<a href="${escapeAttr(safeHref(node.href))}" style="${styles.link}">${renderInlineNodes(
            node.children,
            styles,
          )}</a>`
        case 'image': {
          const alt = escapeAttr(node.alt)
          const src = escapeAttr(node.src)
          return `<img src="${src}" alt="${alt}" style="${styles.imageInline}" />`
        }
        default:
          return ''
      }
    })
    .join('')
}

function renderImageFigure(imageNode: Extract<InlineNode, { type: 'image' }>, styles: TemplateStyles): string {
  const alt = imageNode.alt.trim()
  const captionHtml = alt.length ? `<figcaption style="${styles.figcaption}">${escapeHtml(alt)}</figcaption>` : ''
  return `<figure style="${styles.figure}"><img src="${escapeAttr(imageNode.src)}" alt="${escapeAttr(
    imageNode.alt,
  )}" style="${UNIFIED_IMAGE_STYLE}" />${captionHtml}</figure>`
}

function renderParagraph(children: InlineNode[], styles: TemplateStyles): string {
  const lines = splitInlineLines(children)
  const imageOnly = lines.length > 0 && lines.every((line) => isImageOnlyLine(line))
  if (imageOnly) {
    return lines
      .map((line) => line.map((imageNode) => renderImageFigure(imageNode, styles)).join(''))
      .join('')
  }
  return `<p style="${styles.paragraph}">${renderInlineNodes(children, styles)}</p>`
}

function renderBlockNodes(nodes: BlockNode[], styles: TemplateStyles): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'blank':
          return `<p style="${styles.blank}">&nbsp;</p>`
        case 'hr':
          return `<hr style="${styles.hr}" />`
        case 'heading': {
          const depth = Math.max(1, Math.min(6, node.depth))
          const headingStyle = styles.heading[depth] ?? styles.heading[2]
          return `<h${depth} style="${headingStyle}">${renderInlineNodes(node.children, styles)}</h${depth}>`
        }
        case 'paragraph':
          return renderParagraph(node.children, styles)
        case 'codeblock':
          return `<pre style="${styles.codeBlock}"><code style="${styles.codeBlockInner}">${escapeHtml(
            node.value,
          )}</code></pre>`
        case 'list': {
          const tag = node.ordered ? 'ol' : 'ul'
          const items = node.items
            .map((item) => `<li style="${styles.listItem}">${renderInlineNodes(item, styles)}</li>`)
            .join('')
          return `<${tag} style="${styles.list}">${items}</${tag}>`
        }
        case 'blockquote':
          return `<blockquote style="${styles.blockquote}">${renderBlockNodes(node.children, styles)}</blockquote>`
        case 'callout': {
          const title = node.title?.trim() || node.kind.toUpperCase()
          return `<section style="${styles.callout}"><p style="${styles.calloutTitle}">${escapeHtml(
            title,
          )}</p>${renderBlockNodes(node.children, styles)}</section>`
        }
        default:
          return ''
      }
    })
    .join('\n')
}

export function renderMarkdownWithFixedTemplate(params: RenderFixedTemplateParams): string {
  const template = getFixedTemplateById(params.templateId)
  const styles = buildTemplateStyles(template.id)
  const blocks = parseMarkdown(params.markdown)
  const body = renderBlockNodes(blocks, styles)
  const title = params.title.trim()
  const titleBlock = title.length
    ? `<header style="${styles.titleWrap}"><h1 style="${styles.title}">${escapeHtml(title)}</h1></header>`
    : ''
  const customCss = sanitizeCustomCss(params.customCss)
  const customCssBlock = customCss.length ? `<style>${customCss}</style>` : ''

  return `${customCssBlock}<section data-template-id="${template.id}" style="${styles.root}">${titleBlock}${body}\n${REQUIRED_MP_STYLE_TAG}</section>`
}
