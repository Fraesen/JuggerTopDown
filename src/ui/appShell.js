import { FIELD } from '../game/config.js'
import { DEFAULT_MATCH_SEED } from '../game/state.js'
import { applyTranslations, languageOptionsHtml, t } from '../i18n/index.js'

export function mountAppShell(root = document.querySelector('#app')) {
  root.innerHTML = `
    <nav class="app-menu" aria-label="${t('nav.aria')}">
      <button id="home-nav-btn" type="button" data-i18n="nav.home">${t('nav.home')}</button>
      <button id="docs-nav-btn" type="button" data-i18n="nav.docs">${t('nav.docs')}</button>
      <label class="language-control">
        <span data-i18n="nav.language">${t('nav.language')}</span>
        <select id="language-select" aria-label="${t('nav.language')}">
          ${languageOptionsHtml()}
        </select>
      </label>
    </nav>

    <section id="main-menu" class="main-menu">
      <div class="main-menu-inner">
        <p class="eyebrow" data-i18n="app.eyebrow">${t('app.eyebrow')}</p>
        <h1 data-i18n="app.title">${t('app.title')}</h1>
        <div class="main-menu-actions">
          <button id="bot-game-btn" class="primary" type="button" data-i18n="menu.botGame">${t('menu.botGame')}</button>
          <button id="create-game-btn" type="button" data-i18n="menu.createGame">${t('menu.createGame')}</button>
          <button id="join-game-btn" type="button" data-i18n="menu.joinGame">${t('menu.joinGame')}</button>
        </div>
        <section class="public-rooms-panel" aria-label="${t('menu.publicRooms')}">
          <header>
            <span data-i18n="menu.publicRooms">${t('menu.publicRooms')}</span>
            <button id="refresh-public-rooms-btn" type="button" aria-label="${t('menu.refreshPublicRooms')}">↻</button>
          </header>
          <div id="public-room-list" class="public-room-list"></div>
        </section>
      </div>
    </section>

    <div class="game-shell">
      <header class="score-strip" aria-live="polite">
        <div class="team-score team-score-blue">
          <span data-i18n="team.blue">${t('team.blue')}</span>
          <strong id="blue-score">0</strong>
        </div>
        <div class="match-core">
          <span id="match-state">${t('match.autobattler')}</span>
          <strong id="clock">03:00</strong>
        </div>
        <div class="team-score team-score-red">
          <span data-i18n="team.red">${t('team.red')}</span>
          <strong id="red-score">0</strong>
        </div>
      </header>

      <main class="play-layout">
        <section class="arena-wrap" aria-label="${t('arena.aria')}">
          <canvas id="game" width="${FIELD.width}" height="${FIELD.height}"></canvas>
          <div id="round-setup-overlay" class="round-setup-overlay" hidden></div>
          <div id="round-countdown-overlay" class="round-countdown-overlay" hidden></div>
          <div id="player-tooltip" class="player-tooltip" hidden></div>
        </section>

        <aside class="command-panel">
          <div>
            <p class="eyebrow" data-i18n="app.eyebrow">${t('app.eyebrow')}</p>
            <h1 data-i18n="app.title">${t('app.title')}</h1>
          </div>

          <section id="pvp-status-panel" class="pvp-status-panel" hidden></section>

          <div class="controls-row">
            <button id="start-btn" class="primary" type="button" data-i18n="controls.start">${t('controls.start')}</button>
            <button id="pause-btn" type="button" data-i18n="controls.pause">${t('controls.pause')}</button>
            <button id="reset-btn" type="button" data-i18n="controls.reset">${t('controls.reset')}</button>
          </div>

          <div id="speed-control" class="speed-control" aria-label="${t('controls.speed')}">
            <button type="button" data-speed="0.25">0,25x</button>
            <button type="button" data-speed="0.5">0,5x</button>
            <button type="button" data-speed="1">1x</button>
            <button type="button" data-speed="2">2x</button>
          </div>

          <label id="seed-control" class="seed-control">
            <span data-i18n="controls.seed">${t('controls.seed')}</span>
            <input id="seed-input" type="text" spellcheck="false" autocomplete="off" value="${DEFAULT_MATCH_SEED}" />
          </label>

          <label id="cinema-control" class="cinema-control">
            <input id="cinema-toggle" type="checkbox" />
            <span data-i18n="controls.cinema">${t('controls.cinema')}</span>
          </label>

          <div class="status-grid">
            <div><span data-i18n="status.possession">${t('status.possession')}</span><strong id="possession">${t('status.free')}</strong></div>
            <div><span data-i18n="status.pins">${t('status.pins')}</span><strong id="pins">0</strong></div>
            <div><span data-i18n="status.inactive">${t('status.inactive')}</span><strong id="inactive">0</strong></div>
            <div><span data-i18n="status.stone">${t('status.stone')}</span><strong id="stone">0</strong></div>
          </div>

          <div class="mini-map" id="mini-map" aria-hidden="true"></div>

          <details id="local-skill-panel" class="collapsible-panel skill-panel">
            <summary class="panel-heading">
              <span id="skill-panel-title">${t('panel.skillTitle', { team: t('team.blue') })}</span>
              <strong data-i18n="panel.pointsPerPlayer">${t('panel.pointsPerPlayer')}</strong>
            </summary>
            <div id="skill-list" class="skill-list"></div>
          </details>

          <details id="opponent-skill-panel" class="collapsible-panel skill-panel" hidden>
            <summary class="panel-heading">
              <span data-i18n="panel.opponent">${t('panel.opponent')}</span>
              <strong id="opponent-team-label">${t('team.red')}</strong>
            </summary>
            <div id="opponent-skill-list" class="skill-list"></div>
          </details>

          <details class="collapsible-panel roster-panel">
            <summary class="panel-heading">
              <span data-i18n="panel.teamRoles">${t('panel.teamRoles')}</span>
              <strong data-i18n="panel.rules">${t('panel.rules')}</strong>
            </summary>
            <div class="roster-grid" aria-label="${t('panel.teamRoles')}">
              ${ruleRows()}
            </div>
          </details>
        </aside>
      </main>
    </div>

    <section id="docs-view" class="docs-view" hidden>
      <div class="docs-shell">
        ${t('docs.html')}
      </div>
    </section>

    <div id="pvp-modal" class="modal-backdrop" hidden>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="pvp-modal-title">
        <header>
          <h2 id="pvp-modal-title">${t('modal.pvpTitle')}</h2>
          <button id="pvp-modal-close" type="button" aria-label="${t('modal.close')}">x</button>
        </header>
        <div id="pvp-modal-body"></div>
      </section>
    </div>
  `

  applyTranslations(root)
  const canvas = root.querySelector('#game')
  return {
    canvas,
    ctx: canvas.getContext('2d'),
    arenaWrap: root.querySelector('.arena-wrap'),
    hud: queryHud(root),
  }
}

function queryHud(root) {
  return {
    mainMenu: root.querySelector('#main-menu'),
    gameShell: root.querySelector('.game-shell'),
    docsView: root.querySelector('#docs-view'),
    homeNavBtn: root.querySelector('#home-nav-btn'),
    docsNavBtn: root.querySelector('#docs-nav-btn'),
    languageSelect: root.querySelector('#language-select'),
    botGameBtn: root.querySelector('#bot-game-btn'),
    createGameBtn: root.querySelector('#create-game-btn'),
    joinGameBtn: root.querySelector('#join-game-btn'),
    refreshPublicRoomsBtn: root.querySelector('#refresh-public-rooms-btn'),
    publicRoomList: root.querySelector('#public-room-list'),
    blueScore: root.querySelector('#blue-score'),
    redScore: root.querySelector('#red-score'),
    clock: root.querySelector('#clock'),
    matchState: root.querySelector('#match-state'),
    possession: root.querySelector('#possession'),
    pins: root.querySelector('#pins'),
    inactive: root.querySelector('#inactive'),
    stone: root.querySelector('#stone'),
    miniMap: root.querySelector('#mini-map'),
    roundSetupOverlay: root.querySelector('#round-setup-overlay'),
    roundCountdownOverlay: root.querySelector('#round-countdown-overlay'),
    pvpStatusPanel: root.querySelector('#pvp-status-panel'),
    localSkillPanel: root.querySelector('#local-skill-panel'),
    skillPanelTitle: root.querySelector('#skill-panel-title'),
    skillList: root.querySelector('#skill-list'),
    opponentSkillPanel: root.querySelector('#opponent-skill-panel'),
    opponentTeamLabel: root.querySelector('#opponent-team-label'),
    opponentSkillList: root.querySelector('#opponent-skill-list'),
    playerTooltip: root.querySelector('#player-tooltip'),
    startBtn: root.querySelector('#start-btn'),
    pauseBtn: root.querySelector('#pause-btn'),
    resetBtn: root.querySelector('#reset-btn'),
    seedControl: root.querySelector('#seed-control'),
    seedInput: root.querySelector('#seed-input'),
    speedControl: root.querySelector('#speed-control'),
    cinemaControl: root.querySelector('#cinema-control'),
    cinemaToggle: root.querySelector('#cinema-toggle'),
    speedButtons: [...root.querySelectorAll('[data-speed]')],
    pvpModal: root.querySelector('#pvp-modal'),
    pvpModalTitle: root.querySelector('#pvp-modal-title'),
    pvpModalBody: root.querySelector('#pvp-modal-body'),
    pvpModalClose: root.querySelector('#pvp-modal-close'),
  }
}

function ruleRows() {
  return [
    ['match-dot', 'rule.1'],
    ['runner-dot', 'rule.2'],
    ['pompfer-dot', 'rule.3'],
    ['technik-dot', 'rule.4'],
    ['speed-dot', 'rule.5'],
    ['perception-dot', 'rule.6'],
    ['jugg-dot', 'rule.7'],
    ['pin-dot', 'rule.8'],
    ['pompfer-dot', 'rule.9'],
    ['technik-dot', 'rule.10'],
    ['pin-dot', 'rule.11'],
    ['technik-dot', 'rule.12'],
    ['match-dot', 'rule.13'],
    ['match-dot', 'rule.14'],
    ['speed-dot', 'rule.15'],
    ['runner-dot', 'rule.16'],
    ['jugg-dot', 'rule.17'],
    ['perception-dot', 'rule.18'],
    ['pompfer-dot', 'rule.19'],
    ['pompfer-dot', 'rule.20'],
    ['pompfer-dot', 'rule.21'],
    ['pompfer-dot', 'rule.22'],
    ['perception-dot', 'rule.23'],
    ['match-dot', 'rule.24'],
    ['technik-dot', 'rule.25'],
    ['match-dot', 'rule.26'],
    ['speed-dot', 'rule.27'],
    ['match-dot', 'rule.28'],
  ]
    .map(([className, key]) => `<span class="${className}"></span><strong data-i18n="${key}">${t(key)}</strong>`)
    .join('')
}
