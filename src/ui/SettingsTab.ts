import { App, PluginSettingTab, Setting } from 'obsidian'
import type WeChatPreviewPlugin from '../main'
import { themes } from '../core/themes'

export type WeChatPreviewSettings = {
  themeName: string
  metaText: string
  footerText: string
}

export const DEFAULT_SETTINGS: WeChatPreviewSettings = {
  themeName: 'klein',
  metaText: 'BUBBLE · 2026 · UPDATE.03',
  footerText: 'BUBBLE / DESIGN',
}

export class WeChatPreviewSettingTab extends PluginSettingTab {
  private plugin: WeChatPreviewPlugin

  constructor(app: App, plugin: WeChatPreviewPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'WeChat Preview' })

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('WeChat preview/export theme.')
      .addDropdown((dropdown) => {
        themes.forEach((t) => dropdown.addOption(t.name, t.label))
        dropdown.setValue(this.plugin.settings.themeName)
        dropdown.onChange(async (value) => {
          this.plugin.settings.themeName = value
          await this.plugin.saveSettings()
        })
      })

    new Setting(containerEl)
      .setName('Swiss Klein meta header')
      .setDesc('Top label text shown in Swiss Klein theme.')
      .addText((text) => {
        text.setPlaceholder('BUBBLE · 2026 · UPDATE.03')
        text.setValue(this.plugin.settings.metaText)
        text.onChange(async (value) => {
          this.plugin.settings.metaText = value
          await this.plugin.saveSettings()
        })
      })

    new Setting(containerEl)
      .setName('Swiss Klein footer')
      .setDesc('Bottom signature shown in Swiss Klein theme.')
      .addText((text) => {
        text.setPlaceholder('BUBBLE / DESIGN')
        text.setValue(this.plugin.settings.footerText)
        text.onChange(async (value) => {
          this.plugin.settings.footerText = value
          await this.plugin.saveSettings()
        })
      })
  }
}

