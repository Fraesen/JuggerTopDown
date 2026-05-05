import { FIELD } from '../game/config.js'
import { DEFAULT_MATCH_SEED } from '../game/state.js'
import { DOCS_HTML } from './docsContent.js'

export function mountAppShell(root = document.querySelector('#app')) {
  root.innerHTML = `
    <nav class="app-menu" aria-label="Hauptnavigation">
      <button id="home-nav-btn" type="button">Home</button>
      <button id="docs-nav-btn" type="button">Docs</button>
    </nav>

    <section id="main-menu" class="main-menu">
      <div class="main-menu-inner">
        <p class="eyebrow">5 vs 5 Autobattler</p>
        <h1>Jugger</h1>
        <div class="main-menu-actions">
          <button id="bot-game-btn" class="primary" type="button">Spiel gegen Bots</button>
          <button id="create-game-btn" type="button">Spiel erstellen</button>
          <button id="join-game-btn" type="button">Spiel beitreten</button>
        </div>
        <section class="public-rooms-panel" aria-label="Oeffentliche Raeume">
          <header>
            <span>Oeffentliche Raeume</span>
            <button id="refresh-public-rooms-btn" type="button" aria-label="Oeffentliche Raeume aktualisieren">↻</button>
          </header>
          <div id="public-room-list" class="public-room-list"></div>
        </section>
      </div>
    </section>

    <div class="game-shell">
      <header class="score-strip" aria-live="polite">
        <div class="team-score team-score-blue">
          <span>Blau</span>
          <strong id="blue-score">0</strong>
        </div>
        <div class="match-core">
          <span id="match-state">Autobattler</span>
          <strong id="clock">03:00</strong>
        </div>
        <div class="team-score team-score-red">
          <span>Rot</span>
          <strong id="red-score">0</strong>
        </div>
      </header>

      <main class="play-layout">
        <section class="arena-wrap" aria-label="Jugger Spielfeld">
          <canvas id="game" width="${FIELD.width}" height="${FIELD.height}"></canvas>
          <div id="round-setup-overlay" class="round-setup-overlay" hidden></div>
          <div id="round-countdown-overlay" class="round-countdown-overlay" hidden></div>
          <div id="player-tooltip" class="player-tooltip" hidden></div>
        </section>

        <aside class="command-panel">
          <div>
            <p class="eyebrow">5 vs 5 Autobattler</p>
            <h1>Jugger</h1>
          </div>

          <section id="pvp-status-panel" class="pvp-status-panel" hidden></section>

          <div class="controls-row">
            <button id="start-btn" class="primary" type="button">Start</button>
            <button id="pause-btn" type="button">Pause</button>
            <button id="reset-btn" type="button">Reset</button>
          </div>

          <div id="speed-control" class="speed-control" aria-label="Spielgeschwindigkeit">
            <button type="button" data-speed="0.25">0,25x</button>
            <button type="button" data-speed="0.5">0,5x</button>
            <button type="button" data-speed="1">1x</button>
            <button type="button" data-speed="2">2x</button>
          </div>

          <label id="seed-control" class="seed-control">
            <span>Seed</span>
            <input id="seed-input" type="text" spellcheck="false" autocomplete="off" value="${DEFAULT_MATCH_SEED}" />
          </label>

          <label id="cinema-control" class="cinema-control">
            <input id="cinema-toggle" type="checkbox" />
            <span>Cinema Mode</span>
          </label>

          <div class="status-grid">
            <div><span>Besitz</span><strong id="possession">frei</strong></div>
            <div><span>Pins</span><strong id="pins">0</strong></div>
            <div><span>Inaktiv</span><strong id="inactive">0</strong></div>
            <div><span>Stein</span><strong id="stone">0</strong></div>
          </div>

          <div class="mini-map" id="mini-map" aria-hidden="true"></div>

          <details id="local-skill-panel" class="collapsible-panel skill-panel">
            <summary class="panel-heading">
              <span id="skill-panel-title">Blau skillen</span>
              <strong>6 Punkte pro Person</strong>
            </summary>
            <div id="skill-list" class="skill-list"></div>
          </details>

          <details id="opponent-skill-panel" class="collapsible-panel skill-panel" hidden>
            <summary class="panel-heading">
              <span>Gegenseite</span>
              <strong id="opponent-team-label">Rot</strong>
            </summary>
            <div id="opponent-skill-list" class="skill-list"></div>
          </details>

          <details class="collapsible-panel roster-panel">
            <summary class="panel-heading">
              <span>Teamrollen</span>
              <strong>Regeln</strong>
            </summary>
            <div class="roster-grid" aria-label="Teamrollen">
              ${ruleRows()}
            </div>
          </details>
        </aside>
      </main>
    </div>

    <section id="docs-view" class="docs-view" hidden>
      <div class="docs-shell">
        ${DOCS_HTML}
      </div>
    </section>

    <div id="pvp-modal" class="modal-backdrop" hidden>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="pvp-modal-title">
        <header>
          <h2 id="pvp-modal-title">PvP</h2>
          <button id="pvp-modal-close" type="button" aria-label="Schließen">x</button>
        </header>
        <div id="pvp-modal-body"></div>
      </section>
    </div>
  `

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
    ['match-dot', '3 Punkte gewinnen'],
    ['runner-dot', '1 Läufer:in'],
    ['pompfer-dot', '4 Pompfer:innen'],
    ['technik-dot', 'Technik: 30 + 10 je Punkt'],
    ['speed-dot', 'Geschwindigkeit: Tempo'],
    ['perception-dot', 'Wahrnehmung: Call-Chance'],
    ['jugg-dot', 'Nur Läufer:innen tragen den Jugg'],
    ['pin-dot', 'Nahpompfen pinnen Inaktive'],
    ['pompfer-dot', 'Blau wählt Pompfen, max. 1 Kette'],
    ['technik-dot', 'Schilde blocken frontal besser'],
    ['pin-dot', '5 Steine inaktiv, danach kurzer Satz'],
    ['technik-dot', 'Schläge: Technik-Verhältnis entscheidet'],
    ['match-dot', 'Schlag 0,1s, Doppelfenster 0,3s'],
    ['match-dot', 'Cooldown verhindert Doppel'],
    ['speed-dot', 'Laufender Schlag: -25 Prozentpunkte'],
    ['runner-dot', 'Läufer:innen blocken nicht: +75 Prozentpunkte'],
    ['jugg-dot', 'Läufer:innen-Duelle um Jugg per Technik'],
    ['perception-dot', 'Calls folgen über Wahrnehmung'],
    ['pompfer-dot', 'Ketten pinnen nicht und treffen nicht durch Spielende'],
    ['pompfer-dot', 'Kettenband blockiert während Rückzug'],
    ['pompfer-dot', 'Kettentreffer: doppelte Nachladezeit'],
    ['pompfer-dot', 'Nahpompfen treffen Ketten immer'],
    ['perception-dot', 'Teamstrategien steuern das Anlaufen'],
    ['match-dot', 'Nach Punkten: 20 Steine Strategiepause'],
    ['technik-dot', 'Defensiv: schwerer zu treffen, trifft aber schlechter'],
    ['match-dot', 'Aggressiv: deutlich kleineres Doppelfenster'],
    ['speed-dot', 'Umlaufen: nach klarem Ersttreffer in den Rücken'],
    ['match-dot', 'Cinema Mode: automatische Kamera und Slowmotion'],
  ]
    .map(([className, text]) => `<span class="${className}"></span><strong>${text}</strong>`)
    .join('')
}
