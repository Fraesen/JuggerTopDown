import { FIELD } from '../game/config.js'

export function mountAppShell(root = document.querySelector('#app')) {
  root.innerHTML = `
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
          <div id="player-tooltip" class="player-tooltip" hidden></div>
        </section>

        <aside class="command-panel">
          <div>
            <p class="eyebrow">5 vs 5 Autobattler</p>
            <h1>Jugger</h1>
          </div>

          <div class="controls-row">
            <button id="start-btn" class="primary" type="button">Start</button>
            <button id="pause-btn" type="button">Pause</button>
            <button id="reset-btn" type="button">Reset</button>
          </div>

          <div class="speed-control" aria-label="Spielgeschwindigkeit">
            <button type="button" data-speed="0.25">0,25x</button>
            <button type="button" data-speed="0.5">0,5x</button>
            <button type="button" data-speed="1">1x</button>
            <button type="button" data-speed="2">2x</button>
          </div>

          <div class="status-grid">
            <div><span>Besitz</span><strong id="possession">frei</strong></div>
            <div><span>Pins</span><strong id="pins">0</strong></div>
            <div><span>Inaktiv</span><strong id="inactive">0</strong></div>
            <div><span>Stein</span><strong id="stone">0</strong></div>
          </div>

          <div class="mini-map" id="mini-map" aria-hidden="true"></div>

          <details class="collapsible-panel skill-panel">
            <summary class="panel-heading">
              <span>Blau skillen</span>
              <strong>6 Punkte pro Spieler</strong>
            </summary>
            <div id="skill-list" class="skill-list"></div>
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
    blueScore: root.querySelector('#blue-score'),
    redScore: root.querySelector('#red-score'),
    clock: root.querySelector('#clock'),
    matchState: root.querySelector('#match-state'),
    possession: root.querySelector('#possession'),
    pins: root.querySelector('#pins'),
    inactive: root.querySelector('#inactive'),
    stone: root.querySelector('#stone'),
    miniMap: root.querySelector('#mini-map'),
    skillList: root.querySelector('#skill-list'),
    playerTooltip: root.querySelector('#player-tooltip'),
    startBtn: root.querySelector('#start-btn'),
    pauseBtn: root.querySelector('#pause-btn'),
    resetBtn: root.querySelector('#reset-btn'),
    speedButtons: [...root.querySelectorAll('[data-speed]')],
  }
}

function ruleRows() {
  return [
    ['match-dot', '3 Punkte gewinnen'],
    ['runner-dot', '1 Laeufer'],
    ['pompfer-dot', '4 Pompfer'],
    ['technik-dot', 'Technik: 30 + 10 je Punkt'],
    ['speed-dot', 'Geschwindigkeit: Tempo'],
    ['perception-dot', 'Wahrnehmung: Call-Chance'],
    ['jugg-dot', 'Nur Laeufer tragen den Jugg'],
    ['pin-dot', 'Nahpompfen pinnen Inaktive'],
    ['pompfer-dot', 'Blau waehlt Pompfen, max. 1 Kette'],
    ['technik-dot', 'Schilde blocken frontal besser'],
    ['pin-dot', '5 Steine inaktiv, danach kurzer Satz'],
    ['technik-dot', 'Schlaege: Technik-Verhaeltnis entscheidet'],
    ['match-dot', 'Schlag 0,1s, Doppelfenster 0,3s'],
    ['match-dot', 'Cooldown verhindert Doppel'],
    ['speed-dot', 'Laufender Schlag: -25 Prozentpunkte'],
    ['runner-dot', 'Laeufer blocken nicht: +75 Prozentpunkte'],
    ['jugg-dot', 'Laeufer-Duelle um Jugg per Technik'],
    ['perception-dot', 'Calls folgen ueber Wahrnehmung'],
    ['pompfer-dot', 'Ketten pinnen nicht und treffen nicht durch Spieler'],
    ['pompfer-dot', 'Kettenband blockiert waehrend Rueckzug'],
    ['pompfer-dot', 'Kettentreffer: doppelte Nachladezeit'],
    ['pompfer-dot', 'Nahpompfen treffen Ketten immer'],
    ['perception-dot', 'Teamstrategien steuern das Anlaufen'],
    ['match-dot', 'Nach Punkten: 10s Strategiepause'],
    ['technik-dot', 'Defensiv: schwerer zu treffen, trifft aber schlechter'],
    ['match-dot', 'Aggressiv: deutlich kleineres Doppelfenster'],
    ['speed-dot', 'Umlaufen: nach klarem Ersttreffer in den Ruecken'],
  ]
    .map(([className, text]) => `<span class="${className}"></span><strong>${text}</strong>`)
    .join('')
}
