import { getLanguage } from '../i18n/index.js'
import { escapeHtml } from './html.js'

export const CURRENT_CHANGELOG_VERSION = 2
export const CURRENT_CHANGELOG_LABEL = '1.0.1'
export const CHANGELOG_STORAGE_KEY = 'juggerTopDown.seenChangelogVersion'

const CHANGELOG_GROUP_TITLES = {
  features: {
    de: 'Features',
    en: 'Features',
  },
  balancing: {
    de: 'Balancing',
    en: 'Balancing',
  },
  fixes: {
    de: 'Fehlerbehebungen',
    en: 'Fixes',
  },
  misc: {
    de: 'Sonstiges',
    en: 'Misc',
  },
}

export const CHANGELOG_RELEASES = [
  {
    version: 1,
    label: '1.0.0',
    date: '2026-06-12',
    title: {
      de: 'Version 1.0',
      en: 'Version 1.0',
    },
    versionText: {
      de: 'Diese erste Version enthält eine ganze Reihe von Features, genaueres kann unter "Docs" nachgelesen werden. Für Feedback oder Vorschläge kontaktiert mich gerne auf Discord: zensider',
      en: 'This first version includes a broad set of features; more details are available under "Docs". For feedback or suggestions, feel free to contact me on Discord: zensider',
    },
    features: {
      de: [
        'Jugger gegen Bots und PVP',
        'Vorgefertigte Aufstellungen die in PVP und PVE geladen werden können',
        'Im Bot-Modus können Spiele schneller oder langsamer gemacht werden. Außerdem gibt es einen Cinema-Modus der Highlight-Situationen ranzoomen sollte',
      ],
      en: [
        'Jugger against bots and PvP',
        'Prebuilt formations that can be loaded in PvP and PvE',
        'In bot mode, matches can be sped up or slowed down. There is also a Cinema Mode that should zoom in on highlight moments.',
      ],
    },
    balancing: {
      de: [
        'Die Spielversion ist ein erster Wurf, der sich erstmal beim Testen gut angefühlt hat.',
        'Für Balancingvorschläge, schreibt mir gerne auf Discord: zensider',
      ],
      en: [
        'This version is a first pass that has felt good in testing so far.',
        'For balancing suggestions, feel free to write me on Discord: zensider',
      ],
    },
    fixes: {
      de: [
      ],
      en: [
      ],
    },
    misc: {
      de: [
        'Dieses Projekt ist ein reines Hobbyprojekt und hat keine Gewinnabsichten. Die Fortführung hängt vom Feedback und meiner Freizeit ab :)',
      ],
      en: [
        'This project is purely a hobby project and has no profit motive. Continued development depends on feedback and my free time :)',
      ],
    },
  },
  {
    version: 2,
    label: '1.0.1',
    date: '2026-06-13',
    title: {
      de: 'Version 1.0.1',
      en: 'Version 1.0.1',
    },
    versionText: {
      de: 'Nach der ersten Welle Feedback gibt es ein paar schnell gemachte Fixes.',
      en: 'After the first wave of feedback, this release adds a few quick fixes.',
    },
    features: {
      de: [
        'Die aktuelle Strategie wird nun zwischen den Runden erhalten',
        'Läufer:innen werden nur gepinnt, wenn der Jugg innerhalb von 5 Metern oder im eigenen Drittel frei liegt',
      ],
      en: [
        'The current strategy is now preserved between rounds.',
        'Quicks are only pinned when the Jugg is free within 5 meters or free in the own third.',
      ],
    },
    balancing: {
      de: [
      ],
      en: [
      ],
    },
    fixes: {
      de: [
        'Ketten, die kniende Pompfen bewachten haben manchmal keine neuen Ziele attackiert, was dazu führte, dass alle nur noch rumstanden. Das ist nun gefixt',
      ],
      en: [
        'Chains guarding kneeling Pompfers sometimes failed to attack new targets, which could leave everyone standing around. This is now fixed.',
      ],
    },
    misc: {
      de: [
      ],
      en: [
      ],
    },
  }
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
  const versionText = entry.versionText?.[language] ?? entry.versionText?.de
  return `
    <section class="changelog-entry">
      <header>
        <p class="eyebrow">${escapeHtml(entry.date)}</p>
        <h2>${escapeHtml(entry.label)} - ${escapeHtml(title)}</h2>
        <span>#${entry.version}</span>
      </header>
      ${versionText ? `<p class="changelog-version-text">${escapeHtml(versionText)}</p>` : ''}
      ${changelogListHtml(groupTitle('features', language), entry.features[language] ?? entry.features.de)}
      ${changelogListHtml(groupTitle('balancing', language), entry.balancing[language] ?? entry.balancing.de)}
      ${changelogListHtml(groupTitle('fixes', language), entry.fixes?.[language] ?? entry.fixes?.de)}
      ${changelogListHtml(groupTitle('misc', language), entry.misc?.[language] ?? entry.misc?.de)}
    </section>
  `
}

function groupTitle(group, language) {
  return CHANGELOG_GROUP_TITLES[group]?.[language] ?? CHANGELOG_GROUP_TITLES[group]?.de ?? group
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

