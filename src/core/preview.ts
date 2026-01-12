export function buildWeChatPreviewSrcDoc(html: string): string {
  const hasSwissLayout = html.includes('id="swiss-layout-v2.1"')
  const paperPadding = hasSwissLayout ? '0' : '18px 16px'

  const css = `
html,body{height:100%;}
body{
  margin:0;
  background:#f5f6f7;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;
}
.wechat-shell{
  max-width: 740px;
  margin: 0 auto;
  padding: 24px 18px;
}
.wechat-paper{
  background:#ffffff;
  border:1px solid rgba(17,24,39,0.08);
  border-radius: 12px;
  padding: ${paperPadding};
  min-height: calc(100vh - 48px);
}
img{max-width:100%;height:auto;}
`

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${css}</style></head><body><div class="wechat-shell"><div class="wechat-paper">${html}</div></div></body></html>`
}

