export type FixedTemplateId =
  | 'business-blue'
  | 'brand-red'
  | 'minimal-card'
  | 'journal'
  | 'editorial'
  | 'cyber-neon'
  | 'paper-craft'

export type FixedTemplateVariant = 'classic' | 'minimal-card' | 'journal' | 'editorial' | 'cyber-neon' | 'paper-craft'

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
  {
    id: 'cyber-neon',
    label: 'Cyber Neon',
    description: 'Dark cyberpunk theme with neon glow effects and gradient accents.',
    variant: 'cyber-neon',
    renderTitle: false,
    palette: {
      background: '#0a0a0f',
      text: '#e0e0e8',
      muted: '#6b6b80',
      accent: '#00ff88',
      accentSoft: '#0d1f15',
      border: '#1a3d2e',
      quoteBorder: '#00cc6a',
      quoteBackground: '#0d1a12',
      codeBackground: '#0a1410',
      codeBorder: '#00ff88',
      codeText: '#00ff88',
    },
  },
  {
    id: 'paper-craft',
    label: 'Paper Craft',
    description: 'Handcrafted paper style with sticky notes and highlighter effects.',
    variant: 'paper-craft',
    renderTitle: false,
    palette: {
      background: '#faf8f3',
      text: '#2c2c2c',
      muted: '#7a7a7a',
      accent: '#d4a017',
      accentSoft: '#fff9e6',
      border: '#e0d5c0',
      quoteBorder: '#d4a017',
      quoteBackground: '#fffbeb',
      codeBackground: '#f5f5f0',
      codeBorder: '#c0c0b8',
      codeText: '#4a4a4a',
    },
  },
]

export function getFixedTemplateById(templateId: string | undefined): FixedTemplateDefinition {
  return fixedTemplates.find((template) => template.id === templateId) ?? fixedTemplates[0]
}
