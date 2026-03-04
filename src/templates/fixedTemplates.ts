export type FixedTemplateId = 'business-blue' | 'brand-red'

export type FixedTemplateDefinition = {
  id: FixedTemplateId
  label: string
  description: string
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
  }
}

export const UNIFIED_IMAGE_STYLE =
  'display:block;width:100%;height:auto;border-radius:14px;box-shadow:0 14px 30px rgba(15,23,42,0.16);'

export const fixedTemplates: FixedTemplateDefinition[] = [
  {
    id: 'business-blue',
    label: 'Business Blue',
    description: 'Professional blue theme with clean visual hierarchy.',
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
    },
  },
  {
    id: 'brand-red',
    label: 'Brand Red',
    description: 'Warm red theme suitable for storytelling and branding articles.',
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
    },
  },
]

export function getFixedTemplateById(templateId: string | undefined): FixedTemplateDefinition {
  return fixedTemplates.find((template) => template.id === templateId) ?? fixedTemplates[0]
}
