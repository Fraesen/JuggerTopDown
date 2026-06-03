import { FIELD } from '../game/config.js'
import { DEFAULT_MATCH_SEED } from '../game/state.js'
import { applyTranslations, languageOptionsHtml, t } from '../i18n/index.js'
import { initializeTheme, themeOptionsHtml } from './themes.js'

export function mountAppShell(root = document.querySelector('#app')) {
  initializeTheme()
  root.innerHTML = `
    <nav class="app-menu" aria-label="${t('nav.aria')}">
      <button id="home-nav-btn" type="button" data-i18n="nav.home">${t('nav.home')}</button>
      <button id="formation-nav-btn" type="button" data-i18n="nav.formation">${t('nav.formation')}</button>
      <button id="docs-nav-btn" type="button" data-i18n="nav.docs">${t('nav.docs')}</button>
      <button id="changelog-nav-btn" type="button" data-i18n="nav.changelog">${t('nav.changelog')}</button>
      <button id="profile-name-btn" class="profile-name-btn" type="button"></button>
      <label class="theme-control menu-select-control">
        <span data-i18n="nav.theme">${t('nav.theme')}</span>
        <select id="theme-select" aria-label="${t('nav.theme')}" data-i18n-aria-label="nav.theme">
          ${themeOptionsHtml()}
        </select>
      </label>
      <label class="language-control menu-select-control">
        <span data-i18n="nav.language">${t('nav.language')}</span>
        <select id="language-select" aria-label="${t('nav.language')}" data-i18n-aria-label="nav.language">
          ${languageOptionsHtml()}
        </select>
      </label>
    </nav>

    <section id="main-menu" class="main-menu">
      <canvas id="menu-cinema" class="menu-cinema-canvas" width="${FIELD.width}" height="${FIELD.height}" aria-hidden="true"></canvas>
      <div class="main-menu-inner">
        <p class="eyebrow" data-i18n="app.eyebrow">${t('app.eyebrow')}</p>
        <h1 data-i18n="app.title">${t('app.title')}</h1>
        <div class="main-menu-actions">
          <button id="bot-game-btn" class="primary" type="button" data-i18n="menu.botGame">${t('menu.botGame')}</button>
          <button id="open-formation-btn" type="button" data-i18n="menu.formation">${t('menu.formation')}</button>
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

    <div class="game-shell drawer-collapsed">
      <header class="score-strip" aria-live="polite">
        <div class="team-score team-score-blue">
          <span id="blue-team-label" data-i18n="team.blue">${t('team.blue')}</span>
          <strong id="blue-score">0</strong>
        </div>
        <div class="match-core">
          <div class="match-clock">
            <span id="match-state">${t('match.autobattler')}</span>
            <strong id="clock">03:00</strong>
          </div>
          <div class="controls-row top-controls">
            <button id="start-btn" class="primary" type="button" data-i18n="controls.start">${t('controls.start')}</button>
            <button id="pause-btn" type="button" data-i18n="controls.pause">${t('controls.pause')}</button>
            <button id="reset-btn" type="button" data-i18n="controls.reset">${t('controls.reset')}</button>
          </div>
        </div>
        <div class="team-score team-score-red">
          <span id="red-team-label" data-i18n="team.red">${t('team.red')}</span>
          <strong id="red-score">0</strong>
        </div>
        <div class="core-hud-row">
          <div id="possession-chip" class="hud-chip possession-chip"><span data-i18n="status.possession">${t('status.possession')}</span><strong id="possession">${t('status.free')}</strong></div>
          <div id="stone-chip" class="hud-chip stone-chip"><span data-i18n="status.stone">${t('status.stone')}</span><strong id="stone">0</strong></div>
          <button id="rematch-btn" class="rematch-btn" type="button" hidden data-i18n="controls.rematch">${t('controls.rematch')}</button>
          <button id="drawer-toggle" class="drawer-toggle" type="button" aria-expanded="false" data-i18n="panel.tactics">${t('panel.tactics')}</button>
        </div>
      </header>

      <main class="play-layout">
        <section class="arena-wrap" aria-label="${t('arena.aria')}">
          <canvas id="game" width="${FIELD.width}" height="${FIELD.height}"></canvas>
          <div class="mini-map field-mini-map" id="mini-map" aria-hidden="true"></div>
          <div id="round-setup-overlay" class="round-setup-overlay" hidden></div>
          <div id="round-countdown-overlay" class="round-countdown-overlay" hidden></div>
          <div id="player-tooltip" class="player-tooltip" hidden></div>
        </section>

        <aside class="command-panel right-drawer">
          <div class="drawer-heading">
            <div>
              <p class="eyebrow" data-i18n="panel.tactics">${t('panel.tactics')}</p>
              <h1 data-i18n="app.title">${t('app.title')}</h1>
            </div>
            <button id="drawer-close" type="button" aria-label="${t('modal.close')}">x</button>
          </div>

          <section id="pvp-status-panel" class="pvp-status-panel" hidden></section>

          <details id="match-tools-panel" class="collapsible-panel match-tools-panel" open>
            <summary class="panel-heading">
              <span data-i18n="panel.matchTools">${t('panel.matchTools')}</span>
              <strong data-i18n="panel.direction">${t('panel.direction')}</strong>
            </summary>
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
          </details>

          <div class="status-grid">
            <div><span data-i18n="status.pins">${t('status.pins')}</span><strong id="pins">0</strong></div>
            <div><span data-i18n="status.inactive">${t('status.inactive')}</span><strong id="inactive">0</strong></div>
          </div>

          <details id="local-skill-panel" class="collapsible-panel skill-panel" open>
            <summary class="panel-heading">
              <span id="skill-panel-title">${t('panel.skillTitle', { team: t('team.blue') })}</span>
              <strong data-i18n="panel.pointsPerPlayer">${t('panel.pointsPerPlayer')}</strong>
            </summary>
            <div id="bot-formation-presets" hidden></div>
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
            <div class="roster-grid rulebook" aria-label="${t('panel.teamRoles')}">
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

    <section id="changelog-view" class="changelog-view" hidden>
      <div class="changelog-shell">
        <header class="changelog-page-header">
          <p class="eyebrow" data-i18n="nav.changelog">${t('nav.changelog')}</p>
          <h1 data-i18n="changelog.title">${t('changelog.title')}</h1>
        </header>
        <div id="changelog-page-body"></div>
      </div>
    </section>

    <section id="formation-view" class="formation-view" hidden>
      <div class="formation-manager-shell">
        <header>
          <div>
            <p class="eyebrow" data-i18n="menu.formation">${t('menu.formation')}</p>
            <h1 data-i18n="formation.managerTitle">${t('formation.managerTitle')}</h1>
          </div>
          <button id="formation-back-btn" type="button" data-i18n="nav.home">${t('nav.home')}</button>
        </header>
        <div class="formation-manager-toolbar">
          <label>
            <span data-i18n="formation.presetName">${t('formation.presetName')}</span>
            <input id="formation-preset-name" type="text" maxlength="32" />
          </label>
          <div id="formation-manager-presets"></div>
        </div>
        <div id="formation-manager-formation" class="formation-list"></div>
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

    <div id="profile-modal" class="modal-backdrop" hidden>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <header>
          <h2 id="profile-modal-title">Name</h2>
        </header>
        <form id="profile-form" class="modal-body-grid">
          <label class="profile-name-control">
            <span>Dein Name</span>
            <input id="profile-name-input" name="playerName" type="text" maxlength="24" autocomplete="nickname" required />
          </label>
          <button class="primary" type="submit">Speichern</button>
        </form>
      </section>
    </div>

    <div id="changelog-modal" class="modal-backdrop" hidden>
      <section class="modal changelog-modal" role="dialog" aria-modal="true" aria-labelledby="changelog-modal-title">
        <header>
          <h2 id="changelog-modal-title">${t('changelog.modalTitle')}</h2>
          <button id="changelog-modal-close" type="button" aria-label="${t('modal.close')}">x</button>
        </header>
        <div id="changelog-modal-body"></div>
        <button id="changelog-modal-confirm" class="primary" type="button" data-i18n="changelog.confirm">${t('changelog.confirm')}</button>
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
    menuCinemaCanvas: root.querySelector('#menu-cinema'),
    gameShell: root.querySelector('.game-shell'),
    docsView: root.querySelector('#docs-view'),
    changelogView: root.querySelector('#changelog-view'),
    changelogPageBody: root.querySelector('#changelog-page-body'),
    formationView: root.querySelector('#formation-view'),
    homeNavBtn: root.querySelector('#home-nav-btn'),
    formationNavBtn: root.querySelector('#formation-nav-btn'),
    docsNavBtn: root.querySelector('#docs-nav-btn'),
    changelogNavBtn: root.querySelector('#changelog-nav-btn'),
    profileNameBtn: root.querySelector('#profile-name-btn'),
    themeSelect: root.querySelector('#theme-select'),
    languageSelect: root.querySelector('#language-select'),
    botGameBtn: root.querySelector('#bot-game-btn'),
    openFormationBtn: root.querySelector('#open-formation-btn'),
    createGameBtn: root.querySelector('#create-game-btn'),
    joinGameBtn: root.querySelector('#join-game-btn'),
    refreshPublicRoomsBtn: root.querySelector('#refresh-public-rooms-btn'),
    publicRoomList: root.querySelector('#public-room-list'),
    blueScore: root.querySelector('#blue-score'),
    redScore: root.querySelector('#red-score'),
    blueTeamLabel: root.querySelector('#blue-team-label'),
    redTeamLabel: root.querySelector('#red-team-label'),
    clock: root.querySelector('#clock'),
    matchState: root.querySelector('#match-state'),
    possession: root.querySelector('#possession'),
    possessionChip: root.querySelector('#possession-chip'),
    pins: root.querySelector('#pins'),
    inactive: root.querySelector('#inactive'),
    stone: root.querySelector('#stone'),
    stoneChip: root.querySelector('#stone-chip'),
    miniMap: root.querySelector('#mini-map'),
    roundSetupOverlay: root.querySelector('#round-setup-overlay'),
    roundCountdownOverlay: root.querySelector('#round-countdown-overlay'),
    pvpStatusPanel: root.querySelector('#pvp-status-panel'),
    matchToolsPanel: root.querySelector('#match-tools-panel'),
    localSkillPanel: root.querySelector('#local-skill-panel'),
    skillPanelTitle: root.querySelector('#skill-panel-title'),
    botFormationPresets: root.querySelector('#bot-formation-presets'),
    skillList: root.querySelector('#skill-list'),
    opponentSkillPanel: root.querySelector('#opponent-skill-panel'),
    opponentTeamLabel: root.querySelector('#opponent-team-label'),
    opponentSkillList: root.querySelector('#opponent-skill-list'),
    playerTooltip: root.querySelector('#player-tooltip'),
    startBtn: root.querySelector('#start-btn'),
    pauseBtn: root.querySelector('#pause-btn'),
    resetBtn: root.querySelector('#reset-btn'),
    drawerToggle: root.querySelector('#drawer-toggle'),
    rematchBtn: root.querySelector('#rematch-btn'),
    drawerClose: root.querySelector('#drawer-close'),
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
    profileModal: root.querySelector('#profile-modal'),
    profileForm: root.querySelector('#profile-form'),
    profileNameInput: root.querySelector('#profile-name-input'),
    changelogModal: root.querySelector('#changelog-modal'),
    changelogModalBody: root.querySelector('#changelog-modal-body'),
    changelogModalClose: root.querySelector('#changelog-modal-close'),
    changelogModalConfirm: root.querySelector('#changelog-modal-confirm'),
    formationBackBtn: root.querySelector('#formation-back-btn'),
    formationPresetName: root.querySelector('#formation-preset-name'),
    formationManagerPresets: root.querySelector('#formation-manager-presets'),
    formationManagerFormation: root.querySelector('#formation-manager-formation'),
  }
}

function ruleRows() {
  return [
    ['match-dot', 'ruleGroup.match', ['rule.1', 'rule.11', 'rule.24', 'rule.28']],
    ['quick-dot', 'ruleGroup.roles', ['rule.2', 'rule.3', 'rule.7', 'rule.17']],
    ['technik-dot', 'ruleGroup.duels', ['rule.4', 'rule.5', 'rule.12', 'rule.13', 'rule.14', 'rule.15', 'rule.16']],
    ['pompfer-dot', 'ruleGroup.pompfen', ['rule.8', 'rule.9', 'rule.10', 'rule.19', 'rule.20', 'rule.21', 'rule.22']],
    ['perception-dot', 'ruleGroup.tactics', ['rule.6', 'rule.18', 'rule.23', 'rule.25', 'rule.26']],
  ]
    .map(
      ([className, heading, items]) => `
        <section class="rule-group">
          <header><span class="${className}"></span><strong data-i18n="${heading}">${t(heading)}</strong></header>
          <ul>
            ${items.map((key) => `<li data-i18n="${key}">${t(key)}</li>`).join('')}
          </ul>
        </section>
      `,
    )
    .join('')
}
