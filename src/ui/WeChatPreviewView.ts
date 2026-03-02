import { ItemView, MarkdownView, Notice, type WorkspaceLeaf, setIcon } from 'obsidian'
import type WeChatPreviewPlugin from '../main'
import { stripFrontmatter } from '../core/markdown'
import { buildWeChatPreviewSrcDoc } from '../core/preview'
import { copyRichHtml, copyText } from '../core/clipboard'
import { buildUserPrompt, getPromptThemeById } from '../core/aiPrompts'
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
  themeId: string
  systemPrompt: string
  filePath?: string
}

type StatusTone = 'neutral' | 'loading' | 'success' | 'error'

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

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function stripLeadingTitleHeading(markdownWithoutFrontmatter: string, title: string): string {
  if (!title.trim().length) return markdownWithoutFrontmatter
  const lines = normalizeLineEndings(markdownWithoutFrontmatter).split('\n')
  let firstContentLine = 0
  while (firstContentLine < lines.length && (lines[firstContentLine] ?? '').trim() === '') {
    firstContentLine += 1
  }
  if (firstContentLine >= lines.length) return markdownWithoutFrontmatter

  const headingMatch = /^\s*#\s+(.+?)\s*$/.exec(lines[firstContentLine] ?? '')
  if (!headingMatch?.[1]) return markdownWithoutFrontmatter

  const headingText = headingMatch[1].trim()
  if (normalizeComparableText(headingText) !== normalizeComparableText(title)) {
    return markdownWithoutFrontmatter
  }

  const nextLines = [...lines.slice(0, firstContentLine), ...lines.slice(firstContentLine + 1)]
  if ((nextLines[firstContentLine] ?? '').trim() === '') {
    nextLines.splice(firstContentLine, 1)
  }
  return nextLines.join('\n')
}

function buildAiSourceSignature(
  model: string,
  themeId: string,
  title: string,
  markdown: string,
): string {
  return JSON.stringify({ model, themeId, title, markdown })
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderHintPanel(title: string, description: string, detail?: string): string {
  const detailSection = detail?.trim().length
    ? `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.6;word-break:break-word;">${escapeHtml(
        detail,
      )}</p>`
    : ''
  return `<section style="max-width:700px;margin:24px auto;padding:24px 22px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;"><h3 style="margin:0 0 8px;font-size:18px;line-height:1.4;color:#111827;">${escapeHtml(
    title,
  )}</h3><p style="margin:0;color:#4b5563;font-size:14px;line-height:1.8;">${escapeHtml(
    description,
  )}</p>${detailSection}</section>`
}

export class WeChatPreviewView extends ItemView {
  private plugin: WeChatPreviewPlugin

  private iframeEl: HTMLIFrameElement | null = null
  private statusEl: HTMLElement | null = null
  private generateBtnEl: HTMLButtonElement | null = null
  private copyRenderedBtnEl: HTMLButtonElement | null = null
  private copyHtmlBtnEl: HTMLButtonElement | null = null

  private lastFrameHtml: string | null = null
  private lastCurrentSourceSignature: string | null = null

  private lastAiHtml: string | null = null
  private lastAiSourceSignature: string | null = null
  private lastObservedAiSignature: string | null = null
  private lastObservedFilePath: string | null = null
  private lastAiError: string | null = null
  private lastAiErrorSignature: string | null = null
  private aiRequestSeq = 0
  private aiGenerating = false
  private lastAutoGenerateEnabled: boolean | null = null

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
    const actions = toolbar.createDiv({ cls: 'wechatPreviewActions' })

    this.generateBtnEl = actions.createEl('button', {
      text: 'Generate AI HTML',
      cls: 'wechatPreviewPrimaryBtn',
    })
    this.generateBtnEl.onclick = () => {
      void this.requestGenerateAi()
    }

    this.copyRenderedBtnEl = actions.createEl('button', { text: 'Copy Rendered' })
    this.copyRenderedBtnEl.onclick = () => {
      void this.handleCopyRendered()
    }

    this.copyHtmlBtnEl = actions.createEl('button', { text: 'Copy HTML' })
    this.copyHtmlBtnEl.onclick = () => {
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
    this.generateBtnEl = null
    this.copyRenderedBtnEl = null
    this.copyHtmlBtnEl = null
    this.contentEl.removeClass('wechatPreviewRoot')
  }

  requestRefresh() {
    this.refresh(true)
  }

  async requestGenerateAi(): Promise<void> {
    if (this.aiGenerating) return
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.setStatus('No active note', 'error')
      new Notice('No active Markdown note', 4000)
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
    const markdownForPrompt = stripLeadingTitleHeading(markdownWithoutFrontmatter, title)
    const model = this.resolveModelName()
    const promptTheme = getPromptThemeById(this.plugin.settings.promptThemeId)
    return {
      title,
      markdown: markdownForPrompt,
      model,
      themeId: promptTheme.id,
      systemPrompt: promptTheme.systemPrompt,
      signature: buildAiSourceSignature(model, promptTheme.id, title, markdownForPrompt),
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
      this.lastAiErrorSignature = source.signature
      if (isManual) new Notice('OpenRouter API key is not set', 5000)
      this.refresh(true)
      return
    }

    const requestSeq = ++this.aiRequestSeq
    this.aiGenerating = true
    this.lastAiError = null
    this.lastAiErrorSignature = null
    this.refresh(true)

    try {
      const html = await generateHtmlWithOpenRouter({
        apiKey,
        model: source.model,
        systemPrompt: source.systemPrompt,
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
      this.lastAiErrorSignature = null
      if (isManual) new Notice('AI HTML generated', 3000)
    } catch (error) {
      if (requestSeq !== this.aiRequestSeq) return
      this.lastAiError = stringifyError(error)
      this.lastAiErrorSignature = source.signature
      if (isManual) new Notice(`AI generation failed: ${this.lastAiError}`, 7000)
    } finally {
      if (requestSeq === this.aiRequestSeq) {
        this.aiGenerating = false
        this.refresh(true)
      }
    }
  }

  private getCurrentAiHtml(sourceSignature: string): string | null {
    if (!this.lastAiHtml) return null
    if (this.lastAiSourceSignature !== sourceSignature) return null
    return this.lastAiHtml
  }

  private renderStateHtml(
    source: { filePath?: string },
    sourceSignature: string,
    autoGenerateEnabled: boolean,
  ): string {
    if (this.aiGenerating) {
      return renderHintPanel(
        'Generating AI HTML...',
        'The model is formatting your current note. Please wait.',
        source.filePath ?? 'Current note',
      )
    }

    if (this.lastAiError && this.lastAiErrorSignature === sourceSignature) {
      return renderHintPanel(
        'AI generation failed',
        'Please check API key, model availability, and network, then click Generate AI HTML again.',
        this.lastAiError,
      )
    }

    if (autoGenerateEnabled) {
      return renderHintPanel(
        'Auto generation is enabled',
        'When you stop typing, AI generation starts automatically. You can also click Generate AI HTML manually.',
        source.filePath ?? 'Current note',
      )
    }

    if (this.lastAiHtml && this.lastAiSourceSignature && this.lastAiSourceSignature !== sourceSignature) {
      return renderHintPanel(
        'Content changed',
        'The previous AI result is out of date for this note. Click Generate AI HTML to refresh.',
        source.filePath ?? 'Current note',
      )
    }

    return renderHintPanel(
      'Ready to generate',
      'Click Generate AI HTML to produce WeChat-ready HTML for the current note.',
      source.filePath ?? 'Current note',
    )
  }

  private updateActionButtons(hasCurrentAi: boolean) {
    if (this.generateBtnEl) {
      this.generateBtnEl.textContent = this.aiGenerating ? 'Generating...' : 'Generate AI HTML'
      this.generateBtnEl.disabled = this.aiGenerating
    }

    if (this.copyRenderedBtnEl) this.copyRenderedBtnEl.disabled = !hasCurrentAi
    if (this.copyHtmlBtnEl) this.copyHtmlBtnEl.disabled = !hasCurrentAi
  }

  private refresh(force: boolean) {
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.lastCurrentSourceSignature = null
      this.updateActionButtons(false)
      this.setStatus('No active note', 'error')
      const html = buildWeChatPreviewSrcDoc(
        renderHintPanel('No active note', 'Open a Markdown note first, then generate AI HTML.'),
      )
      if (force || html !== this.lastFrameHtml) {
        this.lastFrameHtml = html
        if (this.iframeEl) this.iframeEl.srcdoc = html
      }
      return
    }

    const aiSource = this.buildAiSource(source.markdown, source.filePath)
    this.lastCurrentSourceSignature = aiSource.signature

    const autoGenerateEnabled = this.plugin.settings.autoGenerateEnabled
    if (autoGenerateEnabled) {
      const filePathChanged = this.lastObservedFilePath !== (source.filePath ?? '')
      const autoJustEnabled = this.lastAutoGenerateEnabled !== true
      if (
        this.lastObservedAiSignature !== aiSource.signature ||
        filePathChanged ||
        autoJustEnabled
      ) {
        this.lastObservedAiSignature = aiSource.signature
        this.lastObservedFilePath = source.filePath ?? ''
        this.scheduleAutoGenerate(aiSource)
      }
      this.lastAutoGenerateEnabled = true
    } else {
      this.lastObservedAiSignature = aiSource.signature
      this.lastObservedFilePath = source.filePath ?? ''
      this.lastAutoGenerateEnabled = false
      this.clearAutoGenerateTimer()
    }

    const currentAiHtml = this.getCurrentAiHtml(aiSource.signature)
    const hasCurrentAi = !!currentAiHtml
    this.updateActionButtons(hasCurrentAi)

    const frameContent = hasCurrentAi
      ? buildWeChatPreviewSrcDoc(currentAiHtml)
      : buildWeChatPreviewSrcDoc(this.renderStateHtml(source, aiSource.signature, autoGenerateEnabled))
    if (force || frameContent !== this.lastFrameHtml) {
      this.lastFrameHtml = frameContent
      if (this.iframeEl) this.iframeEl.srcdoc = frameContent
    }

    const base = source.filePath ?? 'Current note'
    if (this.aiGenerating) {
      this.setStatus(`${base} · Generating AI HTML...`, 'loading')
      return
    }
    if (hasCurrentAi) {
      this.setStatus(`${base} · AI HTML ready`, 'success')
      return
    }
    if (this.lastAiError && this.lastAiErrorSignature === aiSource.signature) {
      this.setStatus(`${base} · AI generation failed`, 'error')
      return
    }
    if (autoGenerateEnabled) {
      this.setStatus(`${base} · Waiting for auto generation`, 'neutral')
      return
    }
    this.setStatus(`${base} · Ready to generate`, 'neutral')
  }

  private setStatus(text: string, tone: StatusTone) {
    if (!this.statusEl) return
    this.statusEl.textContent = text
    this.statusEl.setAttribute('title', text)
    this.statusEl.removeClass('is-loading', 'is-success', 'is-error')
    if (tone === 'loading') this.statusEl.addClass('is-loading')
    if (tone === 'success') this.statusEl.addClass('is-success')
    if (tone === 'error') this.statusEl.addClass('is-error')
  }

  private async handleCopyHtml() {
    const source = this.getActiveMarkdownSource()
    const currentAiHtml =
      source && this.getCurrentAiHtml(this.buildAiSource(source.markdown, source.filePath).signature)
    if (!currentAiHtml) {
      this.setStatus('No AI HTML to copy', 'error')
      new Notice('No AI HTML for current note. Generate first.', 4000)
      return
    }
    this.setStatus('Copying HTML...', 'loading')
    try {
      await copyText(sanitizeWeChatPasteHtml(currentAiHtml))
      this.setStatus('Copied HTML', 'success')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  private async handleCopyRendered() {
    const source = this.getActiveMarkdownSource()
    const currentAiHtml =
      source && this.getCurrentAiHtml(this.buildAiSource(source.markdown, source.filePath).signature)
    if (!currentAiHtml) {
      this.setStatus('No AI HTML to copy', 'error')
      new Notice('No AI HTML for current note. Generate first.', 4000)
      return
    }
    this.setStatus('Copying rendered content...', 'loading')
    try {
      await copyRichHtml(sanitizeWeChatPasteHtml(currentAiHtml))
      this.setStatus('Copied rendered content', 'success')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }
}
