import { de } from './de.js'
import { en } from './en.js'

const STORAGE_KEY = 'jugger-language'
const dictionaries = { de, en }

export const availableLanguages = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
]

let currentLanguage = initialLanguage()

function initialLanguage() {
  if (typeof localStorage === 'undefined') return 'de'
  const stored = localStorage.getItem(STORAGE_KEY)
  return dictionaries[stored] ? stored : 'de'
}

export function getLanguage() {
  return currentLanguage
}

export function setLanguage(language) {
  currentLanguage = dictionaries[language] ? language : 'de'
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, currentLanguage)
}

export function t(key, params = {}) {
  const value = dictionaries[currentLanguage]?.[key] ?? dictionaries.de[key] ?? key
  return interpolate(value, params)
}

export function teamLabel(team) {
  return t(`team.${team}`)
}

export function roleText(index) {
  return index === 0 ? t('role.quick') : t('role.pompfer', { index })
}

export function positionText(slot) {
  return t(`position.${slot}`)
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n)
  })
  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel))
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder))
  })
  document.documentElement.lang = currentLanguage
}

export function languageOptionsHtml() {
  return availableLanguages
    .map((language) => `<option value="${language.id}" ${language.id === currentLanguage ? 'selected' : ''}>${language.label}</option>`)
    .join('')
}

function interpolate(value, params) {
  return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => params[name] ?? '')
}
