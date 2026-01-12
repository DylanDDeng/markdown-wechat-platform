import { MarkdownView, Plugin, type WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE_WECHAT_PREVIEW, WeChatPreviewView } from './ui/WeChatPreviewView'
import {
  DEFAULT_SETTINGS,
  type WeChatPreviewSettings,
  WeChatPreviewSettingTab,
} from './ui/SettingsTab'

export default class WeChatPreviewPlugin extends Plugin {
  settings: WeChatPreviewSettings = { ...DEFAULT_SETTINGS }
  private lastMarkdownView: MarkdownView | null = null

  async onload(): Promise<void> {
    await this.loadSettings()

    this.registerView(
      VIEW_TYPE_WECHAT_PREVIEW,
      (leaf: WorkspaceLeaf) => new WeChatPreviewView(leaf, this),
    )

    this.addCommand({
      id: 'open-wechat-preview',
      name: 'Open WeChat Preview',
      callback: () => this.activateView(),
    })

    this.addSettingTab(new WeChatPreviewSettingTab(this.app, this))

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const view = leaf?.view
        if (view instanceof MarkdownView) this.lastMarkdownView = view
        this.refreshViews()
      }),
    )

    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.refreshViews()
      }),
    )
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW)
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<WeChatPreviewSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.refreshViews()
  }

  getLastMarkdownView(): MarkdownView | null {
    return this.lastMarkdownView
  }

  setLastMarkdownView(view: MarkdownView) {
    this.lastMarkdownView = view
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW).forEach((leaf) => {
      const view = leaf.view
      if (view instanceof WeChatPreviewView) view.requestRefresh()
    })
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW)[0]
    if (existing) {
      this.app.workspace.revealLeaf(existing)
      return
    }

    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false)
    await leaf.setViewState({ type: VIEW_TYPE_WECHAT_PREVIEW, active: true })
    this.app.workspace.revealLeaf(leaf)
  }
}

