export type BlackRedCoverData = {
  kicker: string
  thesis: string
  tension: string
  subline: string
}

export const BLACK_RED_COVER_SYSTEM_PROMPT = `你是一位擅长为公众号长文提炼封面文案的编辑，总结能力强，判断清晰，语气克制。

你的任务不是概括目录，而是从文章里提炼出最值得放上封面的核心判断。

要求：
- 用中文输出
- 保持黑红刊刻风的冷静、锋利、克制
- 不要标题党，不要鸡汤，不要泛泛而谈
- 不要输出 HTML，不要输出解释，只输出用户要求的 JSON`

const DEFAULT_COVER_DATA: BlackRedCoverData = {
  kicker: '核心判断',
  thesis: '把文章最锋利的判断先亮出来',
  tension: '别让标题只停留在复述内容',
  subline: '封面先说结论，再给读者一个值得点开的理由。',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeCoverField(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized.length) return fallback
  return normalized.slice(0, maxLength)
}

function extractJsonObject(rawText: string): string {
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(rawText.trim())
  const unwrapped = fencedMatch?.[1]?.trim() ?? rawText.trim()
  const firstBrace = unwrapped.indexOf('{')
  const lastBrace = unwrapped.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return unwrapped
  return unwrapped.slice(firstBrace, lastBrace + 1)
}

export function buildBlackRedCoverPrompt(params: { title: string; markdown: string }): string {
  const parts = [
    '你是公众号封面编辑，负责从文章中提炼一张「黑红刊刻风」封面的文案骨架。',
    '',
    '任务目标：',
    '- 不要复述全文，而是提炼最值得被放上封面的核心判断。',
    '- 封面文案要有判断、有张力，但不能标题党。',
    '- 重点不是“这篇文章讲什么”，而是“读完后最该带走什么”。',
    '',
    '输出要求：',
    '- 只输出 JSON，不要解释，不要 Markdown 代码块。',
    '- JSON 必须包含 4 个字段：kicker、thesis、tension、subline。',
    '- kicker：2-6 个汉字，像栏目签或主题签，不要空泛，不要重复完整标题。',
    '- thesis：12-24 个汉字，必须是一句能立住的核心判断。',
    '- tension：10-22 个汉字，补充为什么这件事值得点开或继续看。',
    '- subline：16-32 个汉字，做一层落地解释，语气克制，不要口号。',
    '- 不要使用 emoji，不要使用书名号，不要使用多余标点堆砌。',
    '- 如果原文信息不足，就基于标题和正文做最稳妥的归纳。',
    '',
  ]

  if (params.title.trim().length) {
    parts.push(`参考标题：${params.title.trim()}`)
    parts.push('')
  }

  parts.push('文章 Markdown：')
  parts.push('')
  parts.push(params.markdown)
  return parts.join('\n')
}

export function parseBlackRedCoverData(rawText: string): BlackRedCoverData | null {
  try {
    const parsed = JSON.parse(extractJsonObject(rawText)) as Partial<BlackRedCoverData>
    const coverData = {
      kicker: normalizeCoverField(parsed.kicker, DEFAULT_COVER_DATA.kicker, 12),
      thesis: normalizeCoverField(parsed.thesis, DEFAULT_COVER_DATA.thesis, 32),
      tension: normalizeCoverField(parsed.tension, DEFAULT_COVER_DATA.tension, 30),
      subline: normalizeCoverField(parsed.subline, DEFAULT_COVER_DATA.subline, 42),
    }
    const hasMeaningfulData =
      coverData.thesis !== DEFAULT_COVER_DATA.thesis &&
      coverData.tension !== DEFAULT_COVER_DATA.tension &&
      coverData.subline !== DEFAULT_COVER_DATA.subline
    return hasMeaningfulData ? coverData : null
  } catch {
    return null
  }
}

export function renderBlackRedCoverPreview(data: BlackRedCoverData): string {
  const kicker = escapeHtml(data.kicker)
  const thesis = escapeHtml(data.thesis)
  const tension = escapeHtml(data.tension)
  const subline = escapeHtml(data.subline)

  return `<section data-wechat-preview-cover="black-red-imprint" style="margin:0 0 24px;"><div style="margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="display:inline-block;padding:2px 8px;background:#8f1d22;color:#fff6f4;font-size:11px;line-height:1.4;letter-spacing:1px;font-weight:700;text-transform:uppercase;">公众号封面预览</span><span style="font-size:12px;line-height:1.7;color:#7a5b5d;">封面文案提炼自当前文章，不会写入正文 HTML</span></div><div style="width:112px;max-width:100%;height:2px;background:linear-gradient(90deg,#111111 0%,#8f1d22 72%,rgba(143,29,34,0.12) 100%);"></div></div><div style="position:relative;overflow:hidden;aspect-ratio:900 / 383;padding:30px 34px;background:linear-gradient(180deg,#f7f2ef 0%,#fdfaf8 58%,#ffffff 100%);border:1px solid #ded4d1;border-radius:18px;box-shadow:0 16px 40px rgba(17,17,17,0.08),inset 0 0 0 1px rgba(255,255,255,0.7);"><div style="position:absolute;inset:0;background:radial-gradient(circle at top left,rgba(143,29,34,0.08) 0,rgba(143,29,34,0) 36%),linear-gradient(140deg,rgba(17,17,17,0.05) 0,rgba(17,17,17,0) 24%),repeating-linear-gradient(115deg,rgba(17,17,17,0.028) 0,rgba(17,17,17,0.028) 1px,rgba(255,255,255,0) 1px,rgba(255,255,255,0) 12px);pointer-events:none;"></div><div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column;justify-content:space-between;"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;"><div><span style="display:inline-block;padding:4px 10px;background:#8f1d22;color:#fff6f4;font-size:12px;line-height:1.4;letter-spacing:1.6px;font-weight:700;text-transform:uppercase;">${kicker}</span></div><div style="padding-top:4px;font-size:11px;line-height:1.6;letter-spacing:1.8px;color:#7c6c6d;text-transform:uppercase;">Black Red Imprint</div></div><div style="max-width:82%;"><h1 style="margin:0;color:#111111;font-size:36px;line-height:1.24;letter-spacing:0.4px;font-weight:800;">${thesis}</h1><p style="margin:14px 0 0;color:#2b1d1f;font-size:20px;line-height:1.5;font-weight:600;">${tension}</p></div><div><div style="width:48%;min-width:168px;height:2px;background:linear-gradient(90deg,#111111 0%,#8f1d22 68%,rgba(143,29,34,0.12) 100%);margin-bottom:14px;"></div><p style="margin:0;max-width:68%;color:#5b4b4d;font-size:15px;line-height:1.85;letter-spacing:0.3px;">${subline}</p></div></div></div></section>`
}
