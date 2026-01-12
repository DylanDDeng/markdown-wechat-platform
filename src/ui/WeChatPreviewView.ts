import {
  ItemView,
  MarkdownView,
  type WorkspaceLeaf,
  setIcon,
} from 'obsidian'
import type WeChatPreviewPlugin from '../main'
import { parseMarkdown } from '../core/markdown'
import { getThemeByName, themes } from '../core/themes'
import { renderWeChatHtml } from '../core/render'
import { buildWeChatPreviewSrcDoc } from '../core/preview'
import { copyRichHtml, copyText } from '../core/clipboard'

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-preview-view'

export class WeChatPreviewView extends ItemView {
  private plugin: WeChatPreviewPlugin

  private iframeEl: HTMLIFrameElement | null = null
  private statusEl: HTMLElement | null = null
  private themeSelectEl: HTMLSelectElement | null = null

  private lastMarkdown: string | null = null
  private lastHtml: string | null = null
  private lastThemeName: string | null = null
  private lastMetaText: string | null = null
  private lastFooterText: string | null = null
  private refreshTimer: number | null = null

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
    const copyRichBtn = btnWrap.createEl('button', { text: 'Copy (Rich)' })
    copyRichBtn.onclick = () => this.handleCopyRich()

    const copyHtmlBtn = btnWrap.createEl('button', { text: 'Copy HTML' })
    copyHtmlBtn.onclick = () => this.handleCopyHtml()

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
    this.iframeEl = null
    this.statusEl = null
    this.themeSelectEl = null
    this.contentEl.removeClass('wechatPreviewRoot')
  }

  requestRefresh() {
    this.refresh(true)
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

  private refresh(force: boolean) {
    const source = this.getActiveMarkdownSource()
    if (!source) {
      this.setStatus('No active note')
      if (this.iframeEl) this.iframeEl.srcdoc = buildWeChatPreviewSrcDoc(this.renderEmpty())
      return
    }

    const themeName = this.plugin.settings.themeName
    const metaText = this.plugin.settings.metaText
    const footerText = this.plugin.settings.footerText

    if (
      !force &&
      this.lastMarkdown === source.markdown &&
      this.lastThemeName === themeName &&
      this.lastMetaText === metaText &&
      this.lastFooterText === footerText
    ) {
      return
    }

    this.lastMarkdown = source.markdown
    this.lastThemeName = themeName
    this.lastMetaText = metaText
    this.lastFooterText = footerText

    const theme = getThemeByName(themeName)
    const blocks = parseMarkdown(source.markdown)
    const html = renderWeChatHtml(blocks, theme, { metaText, footerText })
    this.lastHtml = html

    if (this.iframeEl) this.iframeEl.srcdoc = buildWeChatPreviewSrcDoc(html)
    this.setStatus(source.filePath ? source.filePath : 'Preview updated')
  }

  private renderEmpty() {
    return `<div class="wechatPreviewEmpty">No active Markdown note.</div>`
  }

  private setStatus(text: string) {
    if (!this.statusEl) return
    this.statusEl.textContent = text
    this.statusEl.setAttribute('title', text)
  }

  private async handleCopyRich() {
    if (!this.lastHtml) {
      this.setStatus('Nothing to copy')
      return
    }
    this.setStatus('Copying…')
    try {
      await copyRichHtml(this.lastHtml)
      this.setStatus('Copied rich HTML (paste into WeChat editor)')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async handleCopyHtml() {
    if (!this.lastHtml) {
      this.setStatus('Nothing to copy')
      return
    }
    this.setStatus('Copying…')
    try {
      await copyText(this.lastHtml)
      this.setStatus('Copied HTML')
    } catch (err) {
      this.setStatus(`Copy failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
