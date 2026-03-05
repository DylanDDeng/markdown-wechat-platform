import { parseMarkdown, type BlockNode, type InlineNode } from '../core/markdown'
import {
  getFixedTemplateById,
  UNIFIED_IMAGE_STYLE,
  type FixedTemplateDefinition,
  type FixedTemplateId,
  type FixedTemplateVariant,
} from './fixedTemplates'

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
  headingNumber: string
  headingContent: string
  editorialSectionWrap: string
  editorialSectionLabel: string
}

type RenderState = {
  sectionIndex: number
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

function buildTemplateStyles(template: FixedTemplateDefinition): TemplateStyles {
  const palette = template.palette
  const variant = template.variant
  const isMinimal = variant === 'minimal-card'
  const isJournal = variant === 'journal'
  const isEditorial = variant === 'editorial'
  const isCyberNeon = variant === 'cyber-neon'
  const isPaperCraft = variant === 'paper-craft'

  const bodyFont = isEditorial
    ? "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"
    : isJournal
      ? "'Avenir Next','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"
      : isCyberNeon
        ? "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"
        : isPaperCraft
          ? "'Georgia','PingFang SC','Hiragino Sans GB','Microsoft YaHei',serif"
          : "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"

  const headingFont = isEditorial
    ? "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;"
    : isJournal
      ? "font-family:'Kaiti SC','STKaiti','KaiTi',serif;"
      : isCyberNeon
        ? "font-family:'SF Pro Display','PingFang SC','Microsoft YaHei',sans-serif;"
        : isPaperCraft
          ? "font-family:'Marker Felt','Kaiti SC','STKaiti',cursive;"
          : ''

  const headingCommon = `margin:30px 0 12px;line-height:1.45;font-weight:700;color:${palette.accent};${headingFont}`

  const codeBlock = isMinimal
    ? `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border:1px solid ${palette.codeBorder};border-radius:12px;overflow-x:auto;`
    : isJournal
      ? `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border:1px solid ${palette.codeBorder};border-radius:10px;box-shadow:0 8px 18px rgba(146,114,58,0.18);overflow-x:auto;`
      : isCyberNeon
        ? `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border-left:4px solid ${palette.codeBorder};border-radius:0 12px 12px 0;box-shadow:0 0 20px rgba(0,255,136,0.15),inset 0 0 20px rgba(0,212,255,0.05);overflow-x:auto;`
        : isPaperCraft
          ? `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border-left:3px dashed ${palette.codeBorder};border-radius:0 8px 8px 0;overflow-x:auto;`
          : `margin:22px 0;padding:14px 16px;background:${palette.codeBackground};border:1px solid ${palette.codeBorder};border-radius:12px;overflow-x:auto;`

  const inlineCodeBackground = isMinimal ? '#1f2937' : isCyberNeon ? '#1a1a2e' : palette.accentSoft
  const inlineCodeColor = isMinimal ? '#f3f4f6' : isCyberNeon ? '#00ff88' : palette.accent

  return {
    root: `font-family:${bodyFont};background:${palette.background};color:${palette.text};font-size:15px;line-height:${
      isEditorial ? '1.8' : '1.9'
    };max-width:700px;margin:0 auto;padding:${
      isEditorial ? '28px 24px' : '24px 20px'
    };border:${isCyberNeon ? '2px' : '1px'} solid ${palette.border};border-radius:${
      isJournal ? '18px' : isEditorial ? '10px' : isCyberNeon ? '16px' : isPaperCraft ? '12px' : '16px'
    };${
      isCyberNeon ? 'box-shadow:0 0 30px rgba(0,212,255,0.15),inset 0 0 60px rgba(0,212,255,0.03);' : 
      isPaperCraft ? 'box-shadow:0 4px 12px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.05);' : ''
    }`,
    titleWrap: `margin:0 0 24px;padding:0 0 14px;border-bottom:1px solid ${palette.border};${
      isEditorial ? 'text-transform:uppercase;' : ''
    }`,
    title: `margin:0;font-size:${isEditorial ? '20px' : '28px'};line-height:1.35;font-weight:700;letter-spacing:-0.2px;color:${palette.accent};${headingFont}${
      isEditorial ? 'text-transform:uppercase;' : ''
    }`,
    paragraph: `margin:0 0 16px;color:${palette.text};font-size:15px;line-height:${isEditorial ? '1.8' : '1.9'};`,
    heading: {
      1: isEditorial
        ? `margin:34px 0 16px;line-height:1.35;font-size:20px;font-weight:700;letter-spacing:0.2px;text-transform:uppercase;color:${palette.text};${headingFont}`
        : isMinimal
          ? `margin:30px 0 12px;display:flex;align-items:baseline;gap:10px;line-height:1.35;font-size:24px;font-weight:700;color:${palette.accent};${headingFont}`
          : isCyberNeon
            ? `margin:34px 0 16px;line-height:1.3;font-size:26px;font-weight:700;color:${palette.accent};text-shadow:0 0 20px rgba(0,212,255,0.5);${headingFont}`
            : isPaperCraft
              ? `margin:30px 0 14px;line-height:1.4;font-size:26px;font-weight:700;color:${palette.accent};border-bottom:2px solid ${palette.accent};padding-bottom:8px;${headingFont}`
              : `${headingCommon}font-size:26px;`,
      2: isEditorial
        ? `margin:0;line-height:1.45;font-size:18px;font-weight:700;letter-spacing:0.2px;text-transform:uppercase;color:${palette.text};${headingFont}`
        : isMinimal
          ? `margin:30px 0 12px;display:flex;align-items:baseline;gap:10px;line-height:1.4;font-size:21px;font-weight:700;color:${palette.accent};${headingFont}`
          : isCyberNeon
            ? `margin:28px 0 12px;display:inline-block;padding:10px 20px;background:linear-gradient(135deg,${palette.accentSoft},#1a1a3e);border-left:4px solid ${palette.accent};border-radius:0 24px 24px 0;font-size:20px;font-weight:700;color:${palette.accent};text-shadow:0 0 10px rgba(0,212,255,0.3);${headingFont}`
            : isPaperCraft
              ? `margin:26px 0 12px;display:inline-block;padding:10px 18px;background:linear-gradient(135deg,#fff9c4,#fff59d);border-left:4px solid ${palette.accent};border-radius:4px 16px 16px 4px;box-shadow:2px 3px 8px rgba(0,0,0,0.1);font-size:20px;font-weight:700;color:#5d4a1a;transform:rotate(-1deg);${headingFont}`
              : `${headingCommon}font-size:22px;padding-left:10px;border-left:4px solid ${palette.accent};`,
      3: isMinimal
        ? `margin:26px 0 10px;display:flex;align-items:baseline;gap:10px;line-height:1.45;font-size:18px;font-weight:700;color:${palette.accent};${headingFont}`
        : isCyberNeon
          ? `margin:24px 0 10px;font-size:18px;font-weight:700;color:${palette.accent};border-bottom:1px dashed ${palette.border};padding-bottom:6px;${headingFont}`
          : isPaperCraft
            ? `margin:22px 0 10px;padding-left:12px;border-left:3px solid ${palette.accent};font-size:18px;font-weight:700;color:${palette.text};${headingFont}`
            : `${headingCommon}font-size:${isEditorial ? '20px' : '19px'};`,
      4: `${headingCommon}font-size:17px;color:${palette.text};`,
      5: `${headingCommon}font-size:16px;color:${palette.text};`,
      6: `${headingCommon}font-size:15px;color:${palette.muted};`,
    },
    list: `margin:0 0 18px;padding-left:${isEditorial ? '22px' : '24px'};color:${palette.text};`,
    listItem: `margin:0 0 8px;line-height:1.85;`,
    hr: `margin:26px 0;border:0;border-top:1px solid ${palette.border};`,
    inlineCode: `font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:13px;padding:1px 6px;border-radius:5px;background:${inlineCodeBackground};color:${inlineCodeColor};border:1px solid ${palette.border};`,
    codeBlock,
    codeBlockInner:
      `font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:13px;line-height:1.75;color:${palette.codeText};white-space:pre;`,
    strong: isCyberNeon
      ? `color:${palette.accent};font-weight:700;text-shadow:0 0 8px rgba(0,212,255,0.4);`
      : isPaperCraft
        ? `background:linear-gradient(180deg,transparent 60%,rgba(255,235,59,0.4) 60%);font-weight:700;color:${palette.text};`
        : `color:${isEditorial ? palette.text : palette.accent};font-weight:700;`,
    em: `color:${palette.text};font-style:italic;`,
    underline: `text-decoration:underline;text-decoration-color:${palette.accent};text-decoration-thickness:1.5px;text-underline-offset:2px;`,
    link: `color:${isEditorial ? palette.text : palette.accent};text-decoration:underline;text-underline-offset:2px;`,
    blank: 'margin:0;height:14px;line-height:14px;',
    blockquote: isCyberNeon
      ? `margin:22px 0;padding:14px 18px;border-left:3px solid ${palette.quoteBorder};background:${palette.quoteBackground};border-radius:0 12px 12px 0;box-shadow:0 0 15px rgba(168,85,247,0.2),inset 0 0 20px rgba(168,85,247,0.05);`
      : isPaperCraft
        ? `margin:22px 0;padding:14px 18px 14px 44px;border-left:none;background:${palette.quoteBackground};border-radius:12px;position:relative;box-shadow:0 2px 8px rgba(0,0,0,0.06);`
        : `margin:22px 0;padding:12px 14px 12px 16px;border-left:4px solid ${palette.quoteBorder};background:${palette.quoteBackground};border-radius:${isEditorial ? '6px' : '0 10px 10px 0'};`,
    callout: `margin:22px 0;padding:14px 16px;background:${palette.accentSoft};border:1px solid ${palette.border};border-radius:12px;`,
    calloutTitle: `margin:0 0 8px;font-size:13px;line-height:1.5;letter-spacing:0.5px;font-weight:700;color:${palette.accent};text-transform:uppercase;`,
    figure: `margin:22px 0;`,
    figcaption: `margin:10px 0 0;color:${palette.muted};font-size:13px;line-height:1.7;text-align:center;`,
    imageInline: `max-width:100%;height:auto;border-radius:14px;box-shadow:0 14px 30px rgba(15,23,42,0.16);vertical-align:middle;`,
    headingNumber: `display:inline-block;min-width:32px;font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:0.8px;color:${palette.muted};`,
    headingContent: 'display:inline-block;flex:1;',
    editorialSectionWrap: `margin:40px 0 16px;padding-top:8px;border-top:1px solid ${palette.border};`,
    editorialSectionLabel: `margin:0 0 8px;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${palette.muted};`,
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

function renderBlockNodes(
  nodes: BlockNode[],
  styles: TemplateStyles,
  variant: FixedTemplateVariant,
  state: RenderState,
): string {
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
          const headingContent = renderInlineNodes(node.children, styles)

          if (variant === 'minimal-card' && depth <= 3) {
            state.sectionIndex += 1
            const sectionNo = String(state.sectionIndex).padStart(2, '0')
            return `<h${depth} style="${headingStyle}"><span style="${styles.headingNumber}">${sectionNo}</span><span style="${styles.headingContent}">${headingContent}</span></h${depth}>`
          }

          if (variant === 'editorial' && depth === 2) {
            state.sectionIndex += 1
            const sectionNo = String(state.sectionIndex).padStart(2, '0')
            return `<section style="${styles.editorialSectionWrap}"><p style="${styles.editorialSectionLabel}">SECTION ${sectionNo}</p><h2 style="${headingStyle}">${headingContent}</h2></section>`
          }

          return `<h${depth} style="${headingStyle}">${headingContent}</h${depth}>`
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
          return `<blockquote style="${styles.blockquote}">${renderBlockNodes(
            node.children,
            styles,
            variant,
            state,
          )}</blockquote>`
        case 'callout': {
          const title = node.title?.trim() || node.kind.toUpperCase()
          return `<section style="${styles.callout}"><p style="${styles.calloutTitle}">${escapeHtml(
            title,
          )}</p>${renderBlockNodes(node.children, styles, variant, state)}</section>`
        }
        default:
          return ''
      }
    })
    .join('\n')
}

export function renderMarkdownWithFixedTemplate(params: RenderFixedTemplateParams): string {
  const template = getFixedTemplateById(params.templateId)
  const styles = buildTemplateStyles(template)
  const blocks = parseMarkdown(params.markdown)
  const body = renderBlockNodes(blocks, styles, template.variant, { sectionIndex: 0 })
  const title = params.title.trim()
  const titleBlock = template.renderTitle && title.length
    ? `<header style="${styles.titleWrap}"><h1 style="${styles.title}">${escapeHtml(title)}</h1></header>`
    : ''
  const customCss = sanitizeCustomCss(params.customCss)
  const customCssBlock = customCss.length ? `<style>${customCss}</style>` : ''

  return `${customCssBlock}<section data-template-id="${template.id}" style="${styles.root}">${titleBlock}${body}\n${REQUIRED_MP_STYLE_TAG}</section>`
}
