export type FixedTemplateId =
  | 'business-blue'
  | 'brand-red'
  | 'minimal-card'
  | 'journal'
  | 'editorial'

export type FixedTemplateVariant = 'classic' | 'minimal-card' | 'journal' | 'editorial'

export type FixedTemplateDefinition = {
  id: FixedTemplateId
  label: string
  description: string
  variant: FixedTemplateVariant
  renderTitle: boolean
  palette: {
    background: string
    text: string
    muted: string
    accent: string
    accentSoft: string
    border: string
    quoteBorder: string
    quoteBackground: string
    codeBackground: string
    codeBorder: string
    codeText: string
  }
}

export const UNIFIED_IMAGE_STYLE =
  'display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 14px 30px rgba(15,23,42,0.16);'

export const fixedTemplates: FixedTemplateDefinition[] = [
  {
    id: 'business-blue',
    label: 'Business Blue',
    description: 'Professional blue theme with clean visual hierarchy.',
    variant: 'classic',
    renderTitle: false,
    palette: {
      background: '#ffffff',
      text: '#1f2d3d',
      muted: '#5f6f85',
      accent: '#1d4ed8',
      accentSoft: '#e8efff',
      border: '#dbe4f3',
      quoteBorder: '#3b82f6',
      quoteBackground: '#eff6ff',
      codeBackground: '#f3f7ff',
      codeBorder: '#cfdbf5',
      codeText: '#111827',
    },
  },
  {
    id: 'brand-red',
    label: 'Brand Red',
    description: 'Warm red theme suitable for storytelling and branding articles.',
    variant: 'classic',
    renderTitle: false,
    palette: {
      background: '#ffffff',
      text: '#1a1a1a',
      muted: '#7a5652',
      accent: '#c2410c',
      accentSoft: '#fff0ea',
      border: '#f2d6cf',
      quoteBorder: '#ea580c',
      quoteBackground: '#fff7f3',
      codeBackground: '#fff7f4',
      codeBorder: '#f2d8cf',
      codeText: '#111827',
    },
  },
  {
    id: 'minimal-card',
    label: 'Minimal Card',
    description: 'Clean card style with numbered headings and dark code blocks.',
    variant: 'minimal-card',
    renderTitle: false,
    palette: {
      background: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280',
      accent: '#111827',
      accentSoft: '#f3f4f6',
      border: '#e5e7eb',
      quoteBorder: '#9ca3af',
      quoteBackground: '#f9fafb',
      codeBackground: '#111827',
      codeBorder: '#1f2937',
      codeText: '#e5e7eb',
    },
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Warm journal look with soft colors and sticky-note code blocks.',
    variant: 'journal',
    renderTitle: false,
    palette: {
      background: '#fffdf8',
      text: '#4b3b2b',
      muted: '#7a6857',
      accent: '#9a5b35',
      accentSoft: '#fff1dd',
      border: '#ecd8be',
      quoteBorder: '#c28a60',
      quoteBackground: '#fff7eb',
      codeBackground: '#fff4b8',
      codeBorder: '#e8d28a',
      codeText: '#4a3726',
    },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Magazine style with uppercase section labels and elegant typography.',
    variant: 'editorial',
    renderTitle: false,
    palette: {
      background: '#ffffff',
      text: '#222222',
      muted: '#6b6b6b',
      accent: '#111111',
      accentSoft: '#f4f4f4',
      border: '#dadada',
      quoteBorder: '#222222',
      quoteBackground: '#f8f8f8',
      codeBackground: '#f7f7f7',
      codeBorder: '#d9d9d9',
      codeText: '#1f2937',
    },
  },
]

export function getFixedTemplateById(templateId: string | undefined): FixedTemplateDefinition {
  return fixedTemplates.find((template) => template.id === templateId) ?? fixedTemplates[0]
}
