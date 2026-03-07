import { ItemView, MarkdownView, Menu, Notice, type WorkspaceLeaf, setIcon } from 'obsidian'
import type WeChatPreviewPlugin from '../main'
import { stripFrontmatter } from '../core/markdown'
import { buildWeChatPreviewSrcDoc } from '../core/preview'
import { copyRichHtml, copyText } from '../core/clipboard'
import {
  buildUserPrompt,
  getPromptThemeById,
  promptThemes,
  type OfficialAccountCardPrompt,
} from '../core/aiPrompts'
import { generateHtmlWithOpenRouter } from '../core/openrouter'
import { fixedTemplates, getFixedTemplateById, type FixedTemplateId } from '../templates/fixedTemplates'
import { renderMarkdownWithFixedTemplate } from '../templates/renderFixedTemplate'
import type { RenderMode } from './SettingsTab'

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-preview-view'

const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.1-pro-preview'
const REQUIRED_MP_STYLE_TAG =
  '<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>'

type AiSource = {
  title: string
  markdown: string
  userPrompt: string
  signature: string
  model: string
  themeId: string
  systemPrompt: string
  filePath?: string
}

type FixedTemplateSource = {
  title: string
  markdown: string
  signature: string
  templateId: FixedTemplateId
  customCss: string
  filePath?: string
}

type StatusTone = 'neutral' | 'loading' | 'success' | 'error'

function hasOfficialAccountCardContent(
  card: OfficialAccountCardPrompt | undefined,
): card is OfficialAccountCardPrompt {
  return !!card?.enabled && card.name.trim().length > 0
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildBlackRedOfficialAccountCardHtml(card: OfficialAccountCardPrompt): string {
  const name = escapeHtml(card.name.trim())
  const tagline = escapeHtml(card.tagline.trim() || '关注后查看最新内容更新')
  const note = escapeHtml(card.note.trim() || '微信扫码关注，获取后续更新')
  const avatarUrl = card.avatarUrl.trim()
  const qrCodeUrl = card.qrCodeUrl.trim()

  const avatarCell = avatarUrl.length
    ? `<td style="width:56px;vertical-align:top;padding-right:12px;"><img src="${escapeAttr(
        avatarUrl,
      )}" style="display:block;width:56px;height:56px;border-radius:50%;border:1px solid #161616;" /></td>`
    : ''

  const qrCell = qrCodeUrl.length
    ? `<td style="width:34%;vertical-align:top;text-align:right;"><div style="display:inline-block;padding:8px;background:#ffffff;border:1px solid #ececec;"><img src="${escapeAttr(
        qrCodeUrl,
      )}" style="display:block;width:96px;height:96px;" /></div></td>`
    : ''

  const contentWidth = qrCodeUrl.length ? '66%' : '100%'

  return `<section data-wechat-preview-official-account-card="black-red-imprint" style="margin:28px 0 0;padding:18px 16px;background:linear-gradient(180deg,#fcf7f6 0%,#ffffff 100%);border:1px solid #e8dede;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.65);"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="display:inline-block;padding:2px 8px;background:#8f1d22;color:#fff6f4;font-size:11px;line-height:1.4;letter-spacing:1px;font-weight:700;text-transform:uppercase;">Official Account</span><span style="font-size:12px;line-height:1.6;color:#7a5b5d;">微信扫码关注</span></div><div style="width:96px;max-width:100%;height:2px;background:linear-gradient(90deg,#111111 0%,#8f1d22 72%,rgba(143,29,34,0.12) 100%);"></div></div><table style="width:100%;border-collapse:collapse;"><tr><td style="width:${contentWidth};vertical-align:top;padding-right:${
    qrCodeUrl.length ? '12px' : '0'
  };"><table style="border-collapse:collapse;"><tr>${avatarCell}<td style="vertical-align:top;"><p style="margin:0 0 6px;color:#111111;font-size:17px;line-height:1.4;font-weight:700;">${name}</p><p style="margin:0;color:#5b4b4d;font-size:13px;line-height:1.75;">${tagline}</p></td></tr></table></td>${qrCell}</tr></table><p style="margin:12px 0 0;padding-top:10px;border-top:1px solid #ececec;color:#7a5b5d;font-size:12px;line-height:1.7;">${note}</p></section>`
}

function appendOfficialAccountCard(
  html: string,
  card: OfficialAccountCardPrompt | undefined,
  themeId: string,
): string {
  if (!hasOfficialAccountCardContent(card)) return html
  if (themeId !== 'black-red-imprint') return html
  if (html.includes('data-wechat-preview-official-account-card=')) return html

  const cardHtml = buildBlackRedOfficialAccountCardHtml(card)
  const mpStyleTagPattern =
    /<p[^>]*>\s*<mp-style-type[^>]*data-value=(?:"|')3(?:"|')[^>]*><\/mp-style-type>\s*<\/p>/i

  if (mpStyleTagPattern.test(html)) {
    return html.replace(mpStyleTagPattern, `${cardHtml}\n$&`)
  }

  return `${html}\n${cardHtml}\n${REQUIRED_MP_STYLE_TAG}`
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
  userPrompt: string,
): string {
  return JSON.stringify({ model, themeId, title, markdown, userPrompt })
}

function buildFixedTemplateSourceSignature(
  templateId: FixedTemplateId,
  customCss: string,
  title: string,
  markdown: string,
): string {
  return JSON.stringify({ templateId, customCss, title, markdown })
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
  private aiModeBtnEl: HTMLButtonElement | null = null
  private fixedTemplateModeBtnEl: HTMLButtonElement | null = null
  private contextLabelEl: HTMLElement | null = null
  private contextSelectEl: HTMLSelectElement | null = null
  private generateBtnEl: HTMLButtonElement | null = null
  private copyBtnEl: HTMLButtonElement | null = null
  private copyMenuBtnEl: HTMLButtonElement | null = null
  private settingsBtnEl: HTMLButtonElement | null = null
  private contextSelectMode: RenderMode | null = null
  private copyMode: 'rendered' | 'html' = 'rendered'

  private lastFrameHtml: string | null = null
  private lastOutputHtml: string | null = null
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

  private lastFixedHtml: string | null = null
  private lastFixedSourceSignature: string | null = null

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
    const mainRow = toolbar.createDiv({ cls: 'wechatPreviewToolbarMain' })

    const modeGroup = mainRow.createDiv({ cls: 'wechatPreviewModeSegment' })
    this.aiModeBtnEl = modeGroup.createEl('button', {
      text: 'AI 排版',
      cls: 'wechatPreviewSegmentBtn',
    })
    this.aiModeBtnEl.onclick = () => {
      void this.handleModeChange('ai')
    }

    this.fixedTemplateModeBtnEl = modeGroup.createEl('button', {
      text: '固定模板',
      cls: 'wechatPreviewSegmentBtn',
    })
    this.fixedTemplateModeBtnEl.onclick = () => {
      void this.handleModeChange('fixed-template')
    }

    const contextGroup = mainRow.createDiv({ cls: 'wechatPreviewContextGroup' })
    this.contextLabelEl = contextGroup.createDiv({
      cls: 'wechatPreviewContextLabel',
      text: 'AI 主题',
    })
    this.contextSelectEl = contextGroup.createEl('select', {
      cls: 'wechatPreviewContextSelect',
    })
    this.contextSelectEl.onchange = () => {
      void this.handleContextSelectionChange()
    }

    const actions = mainRow.createDiv({ cls: 'wechatPreviewPrimaryActions' })
    this.generateBtnEl = actions.createEl('button', {
      text: '生成',
      cls: 'wechatPreviewPrimaryBtn',
    })
    this.generateBtnEl.onclick = () => {
      void this.requestGenerateAi()
    }

    const copyGroup = actions.createDiv({ cls: 'wechatPreviewCopyGroup' })
    this.copyBtnEl = copyGroup.createEl('button', {
      text: this.getCopyButtonText(),
      cls: 'wechatPreviewCopyBtn',
    })
    this.copyBtnEl.onclick = () => {
      void this.handlePrimaryCopy()
    }

    this.copyMenuBtnEl = copyGroup.createEl('button', {
      cls: 'wechatPreviewIconBtn wechatPreviewCopyMenuBtn',
      attr: { 'aria-label': '选择复制方式' },
    })
    setIcon(this.copyMenuBtnEl, 'chevron-down')
    this.copyMenuBtnEl.title = '选择复制方式'
    this.copyMenuBtnEl.onclick = (evt) => {
      this.openCopyMenu(evt)
    }

    this.settingsBtnEl = actions.createEl('button', {
      text: '高级设置',
      cls: 'wechatPreviewSecondaryBtn',
    })
    this.settingsBtnEl.title = '打开插件高级设置'
    this.settingsBtnEl.onclick = () => {
      this.openAdvancedSettings()
    }

    const metaRow = toolbar.createDiv({ cls: 'wechatPreviewToolbarMeta' })
    this.statusEl = metaRow.createDiv({ cls: 'wechatPreviewStatus', text: '' })

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
    this.aiModeBtnEl = null
    this.fixedTemplateModeBtnEl = null
    this.contextLabelEl = null
    this.contextSelectEl = null
    this.generateBtnEl = null
    this.copyBtnEl = null
    this.copyMenuBtnEl = null
    this.settingsBtnEl = null
    this.contextSelectMode = null
    this.contentEl.removeClass('wechatPreviewRoot')
  }

  requestRefresh() {
    this.refresh(true)
  }

  private getRenderMode(): RenderMode {
    return this.plugin.settings.renderMode === 'fixed-template' ? 'fixed-template' : 'ai'
  }

  private async handleModeChange(mode: RenderMode): Promise<void> {
    if (this.plugin.settings.renderMode === mode) return
    this.plugin.settings.renderMode = mode
    await this.plugin.saveSettings()
    this.refresh(true)
  }

  async requestGenerateAi(): Promise<void> {
    if (this.getRenderMode() !== 'ai') {
      this.setStatus('当前为固定模板模式，请先切换到 AI 排版。', 'error')
      new Notice('当前是固定模板模式，请先切换到 AI 排版。', 4000)
      return
    }
    if (this.aiGenerating) return
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.setStatus('没有可生成的 Markdown 笔记。', 'error')
      new Notice('请先打开一个 Markdown 笔记。', 4000)
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
    const officialAccountCard = this.getOfficialAccountCardPrompt()
    const userPrompt = buildUserPrompt({
      title,
      markdown: markdownForPrompt,
      officialAccountCard,
    })
    return {
      title,
      markdown: markdownForPrompt,
      userPrompt,
      model,
      themeId: promptTheme.id,
      systemPrompt: promptTheme.systemPrompt,
      signature: buildAiSourceSignature(model, promptTheme.id, title, markdownForPrompt, userPrompt),
      filePath,
    }
  }

  private buildFixedTemplateSource(markdown: string, filePath?: string): FixedTemplateSource {
    const markdownWithoutFrontmatter = stripFrontmatter(markdown)
    const title =
      extractFrontmatterTitle(markdown) ??
      extractFirstHeading(markdownWithoutFrontmatter) ??
      deriveTitleFromFilePath(filePath)
    const markdownForTemplate = stripLeadingTitleHeading(markdownWithoutFrontmatter, title)
    const templateId = getFixedTemplateById(this.plugin.settings.fixedTemplateId).id
    const customCss = this.plugin.settings.customCss
    return {
      title,
      markdown: markdownForTemplate,
      templateId,
      customCss,
      signature: buildFixedTemplateSourceSignature(templateId, customCss, title, markdownForTemplate),
      filePath,
    }
  }

  private resolveModelName(): string {
    return this.plugin.settings.openRouterModel.trim() || DEFAULT_OPENROUTER_MODEL
  }

  private syncToolbarControls() {
    const mode = this.getRenderMode()

    if (this.aiModeBtnEl) {
      const active = mode === 'ai'
      this.aiModeBtnEl.classList.toggle('is-active', active)
      this.aiModeBtnEl.setAttribute('aria-pressed', String(active))
    }

    if (this.fixedTemplateModeBtnEl) {
      const active = mode === 'fixed-template'
      this.fixedTemplateModeBtnEl.classList.toggle('is-active', active)
      this.fixedTemplateModeBtnEl.setAttribute('aria-pressed', String(active))
    }

    this.syncContextSelector(mode)
  }

  private syncContextSelector(mode: RenderMode) {
    if (!this.contextLabelEl || !this.contextSelectEl) return

    if (this.contextSelectMode !== mode) {
      this.contextSelectEl.innerHTML = ''
      if (mode === 'ai') {
        this.contextLabelEl.textContent = 'AI 主题'
        promptThemes.forEach((theme) => {
          this.contextSelectEl?.appendChild(new Option(theme.label, theme.id))
        })
      } else {
        this.contextLabelEl.textContent = '固定模板'
        fixedTemplates.forEach((template) => {
          this.contextSelectEl?.appendChild(new Option(template.label, template.id))
        })
      }
      this.contextSelectMode = mode
    }

    const value = mode === 'ai' ? this.plugin.settings.promptThemeId : this.plugin.settings.fixedTemplateId
    if (this.contextSelectEl.value !== value) {
      this.contextSelectEl.value = value
    }
  }

  private async handleContextSelectionChange(): Promise<void> {
    const mode = this.getRenderMode()
    const nextValue = this.contextSelectEl?.value
    if (!nextValue) return

    if (mode === 'ai') {
      if (this.plugin.settings.promptThemeId === nextValue) return
      this.plugin.settings.promptThemeId = nextValue
    } else {
      if (this.plugin.settings.fixedTemplateId === nextValue) return
      this.plugin.settings.fixedTemplateId = nextValue as FixedTemplateId
    }

    await this.plugin.saveSettings()
  }

  private getCopyButtonText(): string {
    return this.copyMode === 'html' ? '复制 HTML' : '复制渲染结果'
  }

  private syncCopyButton() {
    if (this.copyBtnEl) this.copyBtnEl.textContent = this.getCopyButtonText()
  }

  private openCopyMenu(evt: MouseEvent) {
    const menu = new Menu()
    menu.addItem((item) => {
      item
        .setTitle('复制渲染结果')
        .setIcon('copy')
        .setChecked(this.copyMode === 'rendered')
        .onClick(() => {
          this.copyMode = 'rendered'
          this.syncCopyButton()
          void this.handlePrimaryCopy()
        })
    })
    menu.addItem((item) => {
      item
        .setTitle('复制 HTML')
        .setIcon('code')
        .setChecked(this.copyMode === 'html')
        .onClick(() => {
          this.copyMode = 'html'
          this.syncCopyButton()
          void this.handlePrimaryCopy()
        })
    })
    menu.showAtMouseEvent(evt)
  }

  private async handlePrimaryCopy(): Promise<void> {
    if (this.copyMode === 'html') {
      await this.handleCopyHtml()
      return
    }
    await this.handleCopyRendered()
  }

  private openAdvancedSettings() {
    const setting = (this.app as unknown as {
      setting?: { open?: () => void; openTabById?: (id: string) => void }
    }).setting

    if (!setting?.open) {
      new Notice('请在 Obsidian 设置中手动打开插件配置。', 4000)
      return
    }

    setting.open()
    setting.openTabById?.(this.plugin.manifest.id)
  }

  private getSourceLabel(filePath?: string): string {
    return filePath ?? '当前笔记'
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
      this.lastAiError = '尚未配置 OpenRouter API Key'
      this.lastAiErrorSignature = source.signature
      if (isManual) new Notice('请先在高级设置中填写 OpenRouter API Key。', 5000)
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
        userPrompt: source.userPrompt,
        retries: 1,
      })

      if (requestSeq !== this.aiRequestSeq) return

      this.lastAiHtml = appendOfficialAccountCard(
        normalizeAiHtml(html),
        this.getOfficialAccountCardPrompt(),
        source.themeId,
      )
      this.lastAiSourceSignature = source.signature
      this.lastAiError = null
      this.lastAiErrorSignature = null
      if (isManual) new Notice('AI HTML 已生成。', 3000)
    } catch (error) {
      if (requestSeq !== this.aiRequestSeq) return
      this.lastAiError = stringifyError(error)
      this.lastAiErrorSignature = source.signature
      if (isManual) new Notice(`AI 生成失败：${this.lastAiError}`, 7000)
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

  private getOfficialAccountCardPrompt(): OfficialAccountCardPrompt {
    return {
      enabled: this.plugin.settings.officialAccountCardEnabled,
      name: this.plugin.settings.officialAccountName,
      tagline: this.plugin.settings.officialAccountTagline,
      avatarUrl: this.plugin.settings.officialAccountAvatarUrl,
      qrCodeUrl: this.plugin.settings.officialAccountQrCodeUrl,
      note: this.plugin.settings.officialAccountCardNote,
    }
  }

  private renderStateHtml(
    source: { filePath?: string },
    sourceSignature: string,
    autoGenerateEnabled: boolean,
  ): string {
    if (this.aiGenerating) {
      return renderHintPanel(
        '正在生成 AI 排版',
        '模型正在整理当前笔记，请稍等片刻。',
        this.getSourceLabel(source.filePath),
      )
    }

    if (this.lastAiError && this.lastAiErrorSignature === sourceSignature) {
      return renderHintPanel(
        'AI 生成失败',
        '请检查 API Key、模型可用性和网络连接，然后重新生成。',
        this.lastAiError,
      )
    }

    if (!this.plugin.settings.openRouterApiKey.trim().length) {
      return renderHintPanel(
        '先完成 AI 设置',
        '请点击右上角的高级设置，填写 OpenRouter API Key 和模型，然后再生成。',
        this.getSourceLabel(source.filePath),
      )
    }

    if (autoGenerateEnabled) {
      return renderHintPanel(
        '已开启自动生成',
        '停止输入后会自动生成，你也可以手动点击生成立即刷新结果。',
        this.getSourceLabel(source.filePath),
      )
    }

    if (this.lastAiHtml && this.lastAiSourceSignature && this.lastAiSourceSignature !== sourceSignature) {
      return renderHintPanel(
        '内容已更新',
        '当前笔记和上一次 AI 结果不一致，建议重新生成。',
        this.getSourceLabel(source.filePath),
      )
    }

    return renderHintPanel(
      '准备就绪',
      '点击生成，即可得到适合公众号粘贴的 HTML 结果。',
      this.getSourceLabel(source.filePath),
    )
  }

  private updateActionButtons(
    mode: RenderMode,
    hasCurrentOutput: boolean,
    options?: { hasStaleOutput?: boolean; hasAnyOutput?: boolean },
  ) {
    const aiMode = mode === 'ai'
    if (this.generateBtnEl) {
      const shouldRegenerate = !!options?.hasStaleOutput || !!options?.hasAnyOutput
      this.generateBtnEl.textContent = this.aiGenerating ? '生成中...' : shouldRegenerate ? '重新生成' : '生成'
      this.generateBtnEl.disabled = !aiMode || this.aiGenerating
      this.generateBtnEl.style.display = aiMode ? '' : 'none'
    }

    this.syncCopyButton()
    if (this.copyBtnEl) this.copyBtnEl.disabled = !hasCurrentOutput
    if (this.copyMenuBtnEl) this.copyMenuBtnEl.disabled = !hasCurrentOutput
  }

  private refresh(force: boolean) {
    this.syncToolbarControls()
    const mode = this.getRenderMode()
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.lastCurrentSourceSignature = null
      this.lastOutputHtml = null
      this.updateActionButtons(mode, false)
      this.setStatus('没有打开中的 Markdown 笔记。', 'error')
      const emptyStateDescription =
        mode === 'ai'
          ? '先打开一个 Markdown 笔记，再在这里生成公众号 HTML。'
          : '先打开一个 Markdown 笔记，固定模板会在这里自动渲染。'
      const html = buildWeChatPreviewSrcDoc(
        renderHintPanel('还没有可预览的笔记', emptyStateDescription),
      )
      if (force || html !== this.lastFrameHtml) {
        this.lastFrameHtml = html
        if (this.iframeEl) this.iframeEl.srcdoc = html
      }
      return
    }

    if (mode === 'fixed-template') {
      this.refreshFixedTemplateMode(source, force)
      return
    }

    this.refreshAiMode(source, force)
  }

  private refreshAiMode(source: { markdown: string; filePath?: string }, force: boolean) {
    const aiSource = this.buildAiSource(source.markdown, source.filePath)
    this.lastCurrentSourceSignature = aiSource.signature
    const sourceLabel = this.getSourceLabel(source.filePath)
    const themeLabel = getPromptThemeById(aiSource.themeId).label
    const apiKeyConfigured = this.plugin.settings.openRouterApiKey.trim().length > 0

    const autoGenerateEnabled = this.plugin.settings.autoGenerateEnabled
    const autoGenerateActive = autoGenerateEnabled && apiKeyConfigured
    if (autoGenerateActive) {
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
    const hasStaleAi =
      !!this.lastAiHtml && !!this.lastAiSourceSignature && this.lastAiSourceSignature !== aiSource.signature
    this.lastOutputHtml = currentAiHtml
    this.updateActionButtons('ai', hasCurrentAi, {
      hasStaleOutput: hasStaleAi,
      hasAnyOutput: !!this.lastAiHtml,
    })

    const frameContent = hasCurrentAi
      ? buildWeChatPreviewSrcDoc(currentAiHtml)
      : buildWeChatPreviewSrcDoc(this.renderStateHtml(source, aiSource.signature, autoGenerateEnabled))
    if (force || frameContent !== this.lastFrameHtml) {
      this.lastFrameHtml = frameContent
      if (this.iframeEl) this.iframeEl.srcdoc = frameContent
    }

    if (this.aiGenerating) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 生成中...`, 'loading')
      return
    }
    if (hasCurrentAi) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 已生成`, 'success')
      return
    }
    if (this.lastAiError && this.lastAiErrorSignature === aiSource.signature) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 生成失败`, 'error')
      return
    }
    if (!apiKeyConfigured) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 待配置 API Key`, 'error')
      return
    }
    if (autoGenerateActive) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 等待自动生成`, 'neutral')
      return
    }
    if (hasStaleAi) {
      this.setStatus(`${sourceLabel} · ${themeLabel} · 内容已更新，待重新生成`, 'neutral')
      return
    }
    this.setStatus(`${sourceLabel} · ${themeLabel} · 准备就绪`, 'neutral')
  }

  private refreshFixedTemplateMode(source: { markdown: string; filePath?: string }, force: boolean) {
    this.clearAutoGenerateTimer()
    this.lastAutoGenerateEnabled = false

    const fixedSource = this.buildFixedTemplateSource(source.markdown, source.filePath)
    this.lastCurrentSourceSignature = fixedSource.signature

    try {
      if (this.lastFixedSourceSignature !== fixedSource.signature || !this.lastFixedHtml) {
        this.lastFixedHtml = renderMarkdownWithFixedTemplate({
          templateId: fixedSource.templateId,
          title: fixedSource.title,
          markdown: fixedSource.markdown,
          customCss: fixedSource.customCss,
        })
        this.lastFixedSourceSignature = fixedSource.signature
      }
    } catch (error) {
      this.lastOutputHtml = null
      this.updateActionButtons('fixed-template', false)
      const frameContent = buildWeChatPreviewSrcDoc(
        renderHintPanel(
          '模板渲染失败',
          '请检查自定义 CSS 语法和 Markdown 内容后重试。',
          stringifyError(error),
        ),
      )
      if (force || frameContent !== this.lastFrameHtml) {
        this.lastFrameHtml = frameContent
        if (this.iframeEl) this.iframeEl.srcdoc = frameContent
      }
      const sourceLabel = this.getSourceLabel(source.filePath)
      this.setStatus(`${sourceLabel} · 固定模板 · 渲染失败`, 'error')
      return
    }

    const fixedHtml = this.lastFixedSourceSignature === fixedSource.signature ? this.lastFixedHtml : null
    const hasCurrentFixed = !!fixedHtml
    this.lastOutputHtml = fixedHtml
    this.updateActionButtons('fixed-template', hasCurrentFixed)

    const frameContent = hasCurrentFixed
      ? buildWeChatPreviewSrcDoc(fixedHtml)
      : buildWeChatPreviewSrcDoc(
          renderHintPanel(
            '模板结果不可用',
            '当前笔记还没有可用的固定模板结果。',
            this.getSourceLabel(source.filePath),
          ),
        )
    if (force || frameContent !== this.lastFrameHtml) {
      this.lastFrameHtml = frameContent
      if (this.iframeEl) this.iframeEl.srcdoc = frameContent
    }

    const sourceLabel = this.getSourceLabel(source.filePath)
    if (hasCurrentFixed) {
      const templateName = getFixedTemplateById(fixedSource.templateId).label
      this.setStatus(`${sourceLabel} · ${templateName} · 已渲染`, 'success')
      return
    }
    this.setStatus(`${sourceLabel} · 固定模板 · 暂无结果`, 'neutral')
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
    const outputHtml = this.lastOutputHtml
    const mode = this.getRenderMode()
    if (!outputHtml) {
      this.setStatus('当前没有可复制的 HTML。', 'error')
      if (mode === 'ai') {
        new Notice('当前笔记还没有 AI HTML，请先生成。', 4000)
      } else {
        new Notice('当前笔记还没有固定模板结果。', 4000)
      }
      return
    }
    this.setStatus('正在复制 HTML...', 'loading')
    try {
      await copyText(sanitizeWeChatPasteHtml(outputHtml))
      this.setStatus('已复制 HTML。', 'success')
    } catch (err) {
      this.setStatus(`复制失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  private async handleCopyRendered() {
    const outputHtml = this.lastOutputHtml
    const mode = this.getRenderMode()
    if (!outputHtml) {
      this.setStatus('当前没有可复制的渲染结果。', 'error')
      if (mode === 'ai') {
        new Notice('当前笔记还没有 AI HTML，请先生成。', 4000)
      } else {
        new Notice('当前笔记还没有固定模板结果。', 4000)
      }
      return
    }
    this.setStatus('正在复制渲染结果...', 'loading')
    try {
      await copyRichHtml(sanitizeWeChatPasteHtml(outputHtml))
      this.setStatus('已复制渲染结果。', 'success')
    } catch (err) {
      this.setStatus(`复制失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }
}
