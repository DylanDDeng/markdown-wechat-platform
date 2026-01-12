function htmlToPlainText(html: string) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent ?? ''
  } catch {
    return html
  }
}

export async function copyText(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('clipboard.writeText 不可用')
  }
  await navigator.clipboard.writeText(text)
}

export async function copyRichHtml(html: string) {
  const plainText = htmlToPlainText(html)
  const ClipboardItemCtor = (
    window as unknown as { ClipboardItem?: typeof ClipboardItem }
  ).ClipboardItem

  if (navigator.clipboard?.write && ClipboardItemCtor) {
    const item = new ClipboardItemCtor({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    })
    await navigator.clipboard.write([item])
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(html)
    return
  }

  throw new Error('当前环境不支持复制')
}

