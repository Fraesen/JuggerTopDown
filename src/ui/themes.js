import { t } from '../i18n/index.js'

const STORAGE_KEY = 'jugger-theme'

export const themes = [
  { id: 'classic', labelKey: 'theme.classic' },
  { id: 'floodlight', labelKey: 'theme.floodlight' },
  { id: 'ember', labelKey: 'theme.ember' },
  { id: 'chalk', labelKey: 'theme.chalk' },
]

let currentTheme = initialTheme()

function initialTheme() {
  if (typeof localStorage === 'undefined') return 'classic'
  const stored = localStorage.getItem(STORAGE_KEY)
  return themes.some((theme) => theme.id === stored) ? stored : 'classic'
}

export function getTheme() {
  return currentTheme
}

export function setTheme(themeId) {
  currentTheme = themes.some((theme) => theme.id === themeId) ? themeId : 'classic'
  if (typeof document !== 'undefined') document.body.dataset.theme = currentTheme
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, currentTheme)
}

export function initializeTheme() {
  setTheme(currentTheme)
}

export function themeOptionsHtml() {
  return themes
    .map((theme) => `<option value="${theme.id}" ${theme.id === currentTheme ? 'selected' : ''}>${t(theme.labelKey)}</option>`)
    .join('')
}
