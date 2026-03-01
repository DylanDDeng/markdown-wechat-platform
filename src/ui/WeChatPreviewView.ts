import { ItemView, MarkdownView, Notice, type WorkspaceLeaf, setIcon } from 'obsidian'
import type WeChatPreviewPlugin from '../main'
import { stripFrontmatter, parseMarkdown } from '../core/markdown'
import { getThemeByName, themes } from '../core/themes'
import { renderWeChatHtml } from '../core/render'
import { buildWeChatPreviewSrcDoc } from '../core/preview'
import { copyRichHtml, copyText } from '../core/clipboard'
import { SYSTEM_PROMPT, buildUserPrompt } from '../core/aiPrompts'
import { generateHtmlWithOpenRouter } from '../core/openrouter'

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-preview-view'

const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.1-pro-preview'
const REQUIRED_MP_STYLE_TAG =
  '<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>'

type AiSource = {
  title: string
  markdown: string
  signature: string
  model: string
  filePath?: string
}

function extractSwissKleinMeta(markdown: string): { metaText: string | null; cleanedMarkdown: string } {
  const source = stripFrontmatter(markdown)
  const lines = source.split('\n')
  const pattern = /这是\s*Bubble\s*(\d{4})\s*年的第\s*(\d+)\s*篇更新/i
  let metaText: string | null = null
  const cleanedLines: string[] = []

  for (const line of lines) {
    const match = pattern.exec(line)
    if (!match) {
      cleanedLines.push(line)
      continue
    }

    if (!metaText) {
      const year = match[1] ?? ''
      const updateNumber = Number.parseInt(match[2] ?? '', 10)
      if (Number.isFinite(updateNumber)) {
        metaText = `BUBBLE ${year} UPDATE ${String(updateNumber).padStart(2, '0')}`
      }
    }

    const trimmed = line.replace(pattern, '').trim()
    if (trimmed.length) cleanedLines.push(trimmed)
  }

  return { metaText, cleanedMarkdown: cleanedLines.join('\n') }
}

function sanitizeWeChatPasteHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('[leaf]').forEach((el) => el.removeAttribute('leaf'))
    return doc.body.innerHTML
  } catch {
    return html.replace(/\sleaf=(\"[^\"]*\"|\'[^\']*\'|[^\s>]+)/g, '')
  }
}

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '')
}

function extractFrontmatterTitle(rawMarkdown: string): string | null {
  const normalized = normalizeLineEndings(rawMarkdown)
  const lines = normalized.split('\n')
  let startIndex = 0
  while (startIndex < lines.length && lines[startIndex]?.trim() === '') startIndex += 1
  if (lines[startIndex]?.trim() !== '---') return null

  const frontmatterLines: string[] = []
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (trimmed === '---' || trimmed === '...') break
    frontmatterLines.push(line)
  }

  for (const line of frontmatterLines) {
    const match = /^\s*title\s*:\s*(.+?)\s*$/i.exec(line)
    if (!match) continue
    let value = match[1] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    const cleaned = value.trim()
    if (cleaned.length) return cleaned
  }

  return null
}

function extractFirstHeading(markdownWithoutFrontmatter: string): string | null {
  const lines = normalizeLineEndings(markdownWithoutFrontmatter).split('\n')
  for (const line of lines) {
    const match = /^\s*#\s+(.+?)\s*$/.exec(line)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function deriveTitleFromFilePath(filePath?: string): string {
  if (!filePath) return ''
  const name = filePath.split('/').pop() ?? ''
  return name.replace(/\.[^.]+$/, '').trim()
}

function buildAiSourceSignature(model: string, title: string, markdown: string): string {
  return JSON.stringify({ model, title, markdown })
}

function normalizeAiHtml(rawHtml: string): string {
  let html = rawHtml.trim()
  const fencedMatch = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(html)
  if (fencedMatch?.[1]) html = fencedMatch[1].trim()

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script').forEach((scriptEl) => scriptEl.remove())
    html = doc.body.innerHTML.trim()
  } catch {
    html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim()
  }

  if (!html.includes('<mp-style-type data-value="3"></mp-style-type>')) {
    html = `${html}\n${REQUIRED_MP_STYLE_TAG}`
  }

  return html
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export class WeChatPreviewView extends ItemView {
  private plugin: WeChatPreviewPlugin

  private iframeEl: HTMLIFrameElement | null = null
  private statusEl: HTMLElement | null = null
  private themeSelectEl: HTMLSelectElement | null = null

  private lastMarkdown: string | null = null
  private lastThemeName: string | null = null
  private lastMetaText: string | null = null
  private lastFooterText: string | null = null
  private lastLocalHtml: string | null = null
  private lastOutputHtml: string | null = null

  private lastAiHtml: string | null = null
  private lastAiSourceSignature: string | null = null
  private lastObservedAiSignature: string | null = null
  private lastObservedFilePath: string | null = null
  private lastAiError: string | null = null
  private aiRequestSeq = 0
  private aiGenerating = false

  private refreshTimer: number | null = null
  private autoGenerateTimer: number | null = null

  constructor(leaf: WorkspaceLeaf, plugin: WeChatPreviewPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return VIEW_TYPE_WECHAT_PREVIEW
  }

  getDisplayText(): string {
    return 'WeChat Preview'
  }

  getIcon(): string {
    return 'scan'
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty()
    this.contentEl.addClass('wechatPreviewRoot')

    const toolbar = this.contentEl.createDiv({ cls: 'wechatPreviewToolbar' })

    const themeWrap = toolbar.createDiv()
    themeWrap.createSpan({ text: 'Theme ' })
    this.themeSelectEl = themeWrap.createEl('select')
    themes.forEach((t) => {
      this.themeSelectEl?.createEl('option', { value: t.name, text: t.label })
    })
    this.themeSelectEl.value = this.plugin.settings.themeName
    this.themeSelectEl.onchange = async () => {
      this.plugin.settings.themeName = this.themeSelectEl?.value ?? 'klein'
      await this.plugin.saveSettings()
    }

    const btnWrap = toolbar.createDiv()
    const generateAiBtn = btnWrap.createEl('button', { text: 'Generate AI HTML' })
    generateAiBtn.onclick = () => {
      void this.requestGenerateAi()
    }

    const copyRenderedBtn = btnWrap.createEl('button', { text: 'Copy Rendered' })
    copyRenderedBtn.onclick = () => {
      void this.handleCopyRendered()
    }

    const copyHtmlBtn = btnWrap.createEl('button', { text: 'Copy HTML' })
    copyHtmlBtn.onclick = () => {
      void this.handleCopyHtml()
    }

    toolbar.createDiv({ cls: 'spacer' })

    this.statusEl = toolbar.createDiv({ cls: 'wechatPreviewStatus', text: '' })

    const frameWrap = this.contentEl.createDiv({ cls: 'wechatPreviewFrameWrap' })
    this.iframeEl = frameWrap.createEl('iframe', {
      cls: 'wechatPreviewFrame',
      attr: { sandbox: 'allow-same-origin' },
    })

    const iconEl = this.containerEl.querySelector('.view-header-icon')
    if (iconEl) setIcon(iconEl as HTMLElement, this.getIcon())

    this.refresh(true)
    this.refreshTimer = window.setInterval(() => this.refresh(false), 600)
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer != null) window.clearInterval(this.refreshTimer)
    this.refreshTimer = null
    this.clearAutoGenerateTimer()
    this.iframeEl = null
    this.statusEl = null
    this.themeSelectEl = null
    this.contentEl.removeClass('wechatPreviewRoot')
  }

  requestRefresh() {
    this.refresh(true)
  }

  async requestGenerateAi(): Promise<void> {
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.setStatus('No active note')
      return
    }
    const aiSource = this.buildAiSource(source.markdown, source.filePath)
    await this.generateAiHtml(aiSource, 'manual')
  }

  private clearAutoGenerateTimer() {
    if (this.autoGenerateTimer != null) window.clearTimeout(this.autoGenerateTimer)
    this.autoGenerateTimer = null
  }

  private getActiveMarkdownSource(): { markdown: string; filePath?: string } | null {
    const view = this.plugin.getLastMarkdownView()
    if (view?.editor) {
      return { markdown: view.editor.getValue(), filePath: view.file?.path }
    }

    const active = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (active?.editor) {
      this.plugin.setLastMarkdownView(active)
      return { markdown: active.editor.getValue(), filePath: active.file?.path }
    }

    const leaves = this.app.workspace.getLeavesOfType('markdown')
    for (const leaf of leaves) {
      const leafView = leaf.view
      if (leafView instanceof MarkdownView && leafView.editor) {
        this.plugin.setLastMarkdownView(leafView)
        return { markdown: leafView.editor.getValue(), filePath: leafView.file?.path }
      }
    }

    return null
  }

  private buildAiSource(markdown: string, filePath?: string): AiSource {
    const markdownWithoutFrontmatter = stripFrontmatter(markdown)
    const title =
      extractFrontmatterTitle(markdown) ??
      extractFirstHeading(markdownWithoutFrontmatter) ??
      deriveTitleFromFilePath(filePath)
    const model = this.resolveModelName()
    return {
      title,
      markdown: markdownWithoutFrontmatter,
      model,
      signature: buildAiSourceSignature(model, title, markdownWithoutFrontmatter),
      filePath,
    }
  }

  private resolveModelName(): string {
    return this.plugin.settings.openRouterModel.trim() || DEFAULT_OPENROUTER_MODEL
  }

  private scheduleAutoGenerate(source: AiSource) {
    const delay = Math.max(0, this.plugin.settings.autoGenerateDebounceMs || 1500)
    this.clearAutoGenerateTimer()
    this.autoGenerateTimer = window.setTimeout(() => {
      this.autoGenerateTimer = null
      void this.generateAiHtml(source, 'auto')
    }, delay)
  }

  private async generateAiHtml(source: AiSource, trigger: 'manual' | 'auto'): Promise<void> {
    const isManual = trigger === 'manual'
    const apiKey = this.plugin.settings.openRouterApiKey.trim()
    if (!apiKey.length) {
      this.lastAiError = 'OpenRouter API key is not set'
      if (isManual) new Notice('OpenRouter API key is not set', 5000)
      this.refresh(true)
      return
    }

    const requestSeq = ++this.aiRequestSeq
    this.aiGenerating = true
    this.lastAiError = null
    this.setStatus(
      `${source.filePath ?? 'Current note'} · Generating AI HTML (${trigger === 'manual' ? 'manual' : 'auto'})`,
    )

    try {
      const html = await generateHtmlWithOpenRouter({
        apiKey,
        model: source.model,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt({
          title: source.title,
          markdown: source.markdown,
        }),
        retries: 1,
      })

      if (requestSeq !== this.aiRequestSeq) return

      this.lastAiHtml = normalizeAiHtml(html)
      this.lastAiSourceSignature = source.signature
      this.lastAiError = null
      if (isManual) new Notice('AI HTML generated', 3000)
    } catch (error) {
      if (requestSeq !== this.aiRequestSeq) return
      this.lastAiError = stringifyError(error)
      if (isManual) new Notice(`AI generation failed: ${this.lastAiError}`, 7000)
    } finally {
      if (requestSeq === this.aiRequestSeq) {
        this.aiGenerating = false
        this.refresh(true)
      }
    }
  }

  private refresh(force: boolean) {
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.setStatus('No active note')
      if (this.iframeEl) this.iframeEl.srcdoc = buildWeChatPreviewSrcDoc(this.renderEmpty())
      this.lastOutputHtml = null
      return
    }

    const themeName = this.plugin.settings.themeName
    const { metaText: derivedMetaText, cleanedMarkdown } = extractSwissKleinMeta(source.markdown)
    const metaText = derivedMetaText ?? this.plugin.settings.metaText
    const footerText = this.plugin.settings.footerText

    const shouldRebuildLocal =
      force ||
      !this.lastLocalHtml ||
      this.lastMarkdown !== source.markdown ||
      this.lastThemeName !== themeName ||
      this.lastMetaText !== metaText ||
      this.lastFooterText !== footerText

    if (shouldRebuildLocal) {
      this.lastMarkdown = source.markdown
      this.lastThemeName = themeName
      this.lastMetaText = metaText
      this.lastFooterText = footerText

      const theme = getThemeByName(themeName)
      const blocks = parseMarkdown(cleanedMarkdown)
      this.lastLocalHtml = renderWeChatHtml(blocks, theme, { metaText, footerText })
    }

    const aiSource = this.buildAiSource(source.markdown, source.filePath)
    const usingAi = !!this.lastAiHtml && this.lastAiSourceSignature === aiSource.signature
    const outputHtml = usingAi ? this.lastAiHtml : this.lastLocalHtml

    if (this.plugin.settings.autoGenerateEnabled) {
      const filePathChanged = this.lastObservedFilePath !== (source.filePath ?? '')
      if (this.lastObservedAiSignature !== aiSource.signature || filePathChanged) {
        this.lastObservedAiSignature = aiSource.signature
        this.lastObservedFilePath = source.filePath ?? ''
        this.scheduleAutoGenerate(aiSource)
      }
    } else {
      this.lastObservedAiSignature = aiSource.signature
      this.lastObservedFilePath = source.filePath ?? ''
      this.clearAutoGenerateTimer()
    }

    if (outputHtml && (force || outputHtml !== this.lastOutputHtml)) {
      this.lastOutputHtml = outputHtml
      if (this.iframeEl) this.iframeEl.srcdoc = buildWeChatPreviewSrcDoc(outputHtml)
    }

    this.updateStatus(source.filePath, usingAi)
  }

  private updateStatus(filePath: string | undefined, usingAi: boolean) {
    const base = filePath ?? 'Preview updated'
    if (this.aiGenerating) {
      this.setStatus(`${base} · Generating AI HTML…`)
      return
    }
    if (usingAi) {
      this.setStatus(`${base} · AI HTML`)
      return
    }
    if (this.lastAiError) {
      this.setStatus(`${base} · Local fallback (${this.lastAiError})`)
      return
    }
    this.setStatus(`${base} · Local preview`)
  }

  private renderEmpty() {
    return `<div class="wechatPreviewEmpty">No active Markdown note.</div>`
  }

  private setStatus(text: string) {
    if (!this.statusEl) return
    this.statusEl.textContent = text
    this.statusEl.setAttribute('title', text)
  }

  private async handleCopyHtml() {
    if (!this.lastOutputHtml) {
      this.setStatus('Nothing to copy')
      return
    }
    this.setStatus('Copying…')
    try {
      await copyText(sanitizeWeChatPasteHtml(this.lastOutputHtml))
      this.setStatus('Copied HTML')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async handleCopyRendered() {
    if (!this.lastOutputHtml) {
      this.setStatus('Nothing to copy')
      return
    }
    this.setStatus('Copying…')
    try {
      await copyRichHtml(sanitizeWeChatPasteHtml(this.lastOutputHtml))
      this.setStatus('Copied rendered content (paste into WeChat editor)')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
