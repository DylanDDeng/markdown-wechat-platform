export type ThemeTokens = {
  name: string
  label: string
  font: {
    family: string
    size: string
    lineHeight: string
  }
  heading: {
    h1: string
    h2: string
    h3: string
  }
  color: {
    text: string
    muted: string
    link: string
    border: string
    codeBg: string
    quoteBg: string
  }
  radius: string
}

export const themes: ThemeTokens[] = [
  {
    name: 'klein',
    label: 'Swiss Klein 2.1',
    font: {
      family: '"Helvetica Neue", Arial, "PingFang SC", sans-serif',
      size: '15px',
      lineHeight: '1.8',
    },
    heading: { h1: '20px', h2: '18px', h3: '16px' },
    color: {
      text: '#222222',
      muted: '#888888',
      link: '#002FA7',
      border: '#e0e0e0',
      codeBg: '#f4f6f9',
      quoteBg: '#ffffff',
    },
    radius: '2px',
  },
]

export function getThemeByName(name: string | undefined): ThemeTokens {
  return themes.find((t) => t.name === name) ?? themes[0]
}

