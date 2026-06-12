import { getLanguage } from '../i18n/index.js'
import { escapeHtml } from './html.js'

export const CURRENT_CHANGELOG_VERSION = 1
export const CURRENT_CHANGELOG_LABEL = '1.0.0'
export const CHANGELOG_STORAGE_KEY = 'juggerTopDown.seenChangelogVersion'

export const CHANGELOG_RELEASES = [
  {
    version: 1,
    label: '1.0.0',
    date: '2026-05-31',
    title: {
      de: 'Open-Source-Grundlage',
      en: 'Open source foundation',
    },
    features: {
      de: [
        'Changelog-Seite und Release-Hinweise eingefuehrt.',
        'Aufstellungsverwaltung, Skillkarten und Presets fuer den ersten oeffentlichen Stand stabilisiert.',
        'Projekt um README, MIT-Lizenz und klarere Build-Hinweise ergaenzt.',
      ],
      en: [
        'Added changelog page and release notes.',
        'Stabilized formation management, skill cards and presets for the first public version.',
        'Added README, MIT license and clearer build notes.',
      ],
    },
    balancing: {
      de: [
        'Englische Rollenbezeichnung auf Quick vereinheitlicht.',
        'Jugg-Besitz wird intern direkt ueber die Quick referenziert.',
      ],
      en: [
        'Unified the English role name to Quick.',
        'Jugg possession is now represented directly by the Quick in code.',
      ],
    },
  },
]

export function latestChangelogVersion() {
  return Math.max(...CHANGELOG_RELEASES.map((entry) => entry.version))
}

export function readSeenChangelogVersion() {
  try {
    return Number(localStorage.getItem(CHANGELOG_STORAGE_KEY) || 0) || 0
  } catch {
    return latestChangelogVersion()
  }
}

export function writeSeenChangelogVersion(version = latestChangelogVersion()) {
  try {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, String(version))
  } catch {
    // Storage can be unavailable in restricted browser contexts; the changelog still remains readable.
  }
}

export function hasSeenCurrentChangelog() {
  return readSeenChangelogVersion() >= latestChangelogVersion()
}

export function renderChangelogHtml({ onlyUnseen = false, seenVersion = readSeenChangelogVersion() } = {}) {
  const entries = CHANGELOG_RELEASES
    .filter((entry) => !onlyUnseen || entry.version > seenVersion)
    .sort((a, b) => b.version - a.version)

  return `
    <article class="changelog-article">
      ${entries.map(changelogEntryHtml).join('')}
    </article>
  `
}

function changelogEntryHtml(entry) {
  const language = getLanguage()
  const title = entry.title[language] ?? entry.title.de
  return `
    <section class="changelog-entry">
      <header>
        <p class="eyebrow">${escapeHtml(entry.date)}</p>
        <h2>${escapeHtml(entry.label)} - ${escapeHtml(title)}</h2>
        <span>#${entry.version}</span>
      </header>
      ${changelogListHtml('Features', entry.features[language] ?? entry.features.de)}
      ${changelogListHtml('Balancing', entry.balancing[language] ?? entry.balancing.de)}
    </section>
  `
}

function changelogListHtml(title, items = []) {
  if (!items.length) return ''
  return `
    <div class="changelog-group">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `
}

