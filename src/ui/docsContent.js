export const DOCS_HTML = `
  <article class="docs-article">
    <header class="docs-hero">
      <p class="eyebrow">Dokumentation</p>
      <h1>JuggerTopDown</h1>
      <p>
        Diese Dokumentation beschreibt die Simulation, nicht das vollständige Turnierregelwerk.
        Das aktuelle Regelwerk für den realen Sport findet sich hier:
        <a href="https://www.jugger.org/downloads" target="_blank" rel="noreferrer">jugger.org/downloads</a>.
      </p>
    </header>

    <section>
      <h2>Relevante Juggerregeln in Kurzform</h2>
      <p>
        Jugger wird als 5 gegen 5 gespielt: pro Team ein:e Läufer:in und vier Pompfer:innen.
        Die Läufer:in ist die einzige Person, die den Jugg tragen und einen Punkt am gegnerischen Mal erzielen kann.
        Pompfer:innen halten die Gegenseite mit ihren Pompfen von der Läufer:in fern oder pinnen bereits abgeschlagene Personen.
      </p>
      <ul>
        <li>Ein Match endet bei 3 Punkten ("Best of five").</li>
        <li>Der Jugg startet frei in der Mitte und wird von Läufer:innen aufgenommen oder umkämpft.</li>
        <li>Abgeschlagene Spielende knien für eine Strafzeit ab. Normale Treffer geben 5 Steine, Kettentreffer 8 Steine. Ein Stein entspricht 1,5 Sekunden.</li>
        <li>Gepinnte Spielende bleiben unten, bis der Pin gelöst wird. In der Simulation kann genau eine Person eine gegnerische Person pinnen.</li>
        <li>Wenn beide Läufer:innen gleichzeitig um den Jugg kämpfen, wird der Besitz über Technik entschieden. Bei beidseitigem Erfolg wird der Jugg festgehalten.</li>
        <li>Ein Punkt am Mal ist nicht möglich, solange der Jugg umkämpft oder die Läufer:in geklammert ist.</li>
      </ul>
    </section>

    <section>
      <h2>Adaption und Spielablauf</h2>
      <p>
        "Jugger Topdown" ist ein Autobattler. Spielende werden nicht direkt gesteuert, sondern entscheiden pro Tick anhand von Rolle,
        Pompfe, Teamstrategie, Calls, Jugg-Situation, Nähe zur Gegenseite und Zustand. Gleicher Seed und gleiche Konfiguration führen zu gleichem Ablauf.
      </p>
      <ul>
        <li>Teams starten links und rechts außerhalb der Grundlinie und laufen zum ersten Kontakt an.</li>
        <li>Die große Uhr im HUD zeigt die verbleibende Matchzeit in Minuten und Sekunden. Während einer Strategiepause bleibt diese Matchzeit sichtbar; der eigentliche Pausen-Countdown läuft über die verbleibenden Steine.</li>
        <li>Zwischen Punkten gibt es eine Strategiepause von 20 Steinen. In den letzten 3 Steinen ist die Aufstellung gesperrt und es zählt groß <code>3</code>, <code>2</code>, <code>1</code>, <code>Jugger!</code> herunter.</li>
        <li>Im Botmodus können Skillung, Pompfen, Positionen und Teamstrategie über "Taktik" angepasst werden, solange die jeweilige Phase Änderungen erlaubt. Im PvP wird die Teamkonfiguration synchron über den Server verteilt.</li>
        <li>Nach der ersten PvP-Setup-Phase ist die Skillung gesperrt; zwischen Zügen werden nur Aufstellung, Pompfen und Teamstrategie geändert.</li>
        <li>Der Bot-Modus bietet einige zusätzliche Optionen wie schnellere Spiele oder den "Cinema Mode". Dieser steuert Kamera/Slowmotion für erkannte Highlight-Szenen.</li>
      </ul>
    </section>

    <section>
      <h2>Trefferberechnung und Stats</h2>
      <p>
        Jede spielende Person hat 12 Skillpunkte auf Technik, Geschwindigkeit und Wahrnehmung.
        Technik startet bei 30 und steigt um 5 pro Punkt. Geschwindigkeit startet bei 40 und steigt um 4 pro Punkt.
        Wahrnehmung startet bei 30 Prozent und steigt um 5 Prozentpunkte pro Punkt.
        Läufer:innen nutzen keine komplett eigene Geschwindigkeitsformel, haben aber einen kleinen konstanten Bonus in der gemeinsamen Speed-Berechnung.
      </p>
      <ul>
        <li>Grundchance: Technik der angreifenden Person / (Technik der angreifenden Person + Technik der verteidigenden Person + möglicher Schildbonus).</li>
        <li>Gegen Läufer:innen steigt die Trefferchance stark, weil Läufer:innen nicht blocken.</li>
        <li>Schläge im Laufen sind erlaubt, bekommen aber je nach Pompfe einen Malus.</li>
        <li>Rückentreffer verdoppeln die Chance und können nicht geblockt werden.</li>
        <li>Schläge dauern 0,1 Sekunden. Treffen sich zwei Spielende gleichzeitig (0,3s Fenster), wird ein Doppel ausgelöst. Zwischen den Schlägen gibt es einen Cooldown von 0,66 Sekunden. Wer im Cooldown ist, kann kein Doppel erzeugen.</li>
      </ul>
    </section>

    <section>
      <h2>Grundlegende Entscheidungslogik</h2>
      <ul>
        <li>Läufer:innen laufen zum Jugg, tragen ihn zum gegnerischen Mal oder ziehen sich zurück, wenn der direkte Weg durch gegnerische Reichweiten führt.</li>
        <li>Trägt die laufende Person den Jugg und hat Raum, kann sie Druck über eine Seite suchen. Dabei wird eine gekrümmte Route durch oberes oder unteres Drittel gesucht.</li>
        <li>Pompfer:innen binden aktive Personen der Gegenseite, schützen die eigene Läufer:in, greifen gegnerische Läufer:innen an oder suchen nach ausreichend lange sitzenden Personen zum Pinnen.</li>
        <li>Ketten suchen aktive Personen der Gegenseite. Gibt es keine aktiven Gegner:innen, bewachen sie mit Abstand inaktive Gegner:innen.</li>
        <li>Pinnende Spielende dürfen sich im Pinradius bewegen, wenn sie dadurch näher an relevante Gegner:innen kommen, und müssen die gepinnte Person nicht anschauen.</li>
      </ul>
    </section>

    <section>
      <h2>Pompfen, Trefferflächen und Sonderregeln</h2>
      <p>
        Die Reichweiten sind visuell angepasst und nicht als maßstabsgetreue Draufsicht der echten Pompfenlängen gemeint. In der Berechnung werden die Reichweiten proportional aus den Regelmaßen abgeleitet.
        Treffer werden nur geprüft, wenn Ziel, Reichweite und Blickwinkel passen.
        Die relativen Reichweiten leiten sich aus den Regelmaßen ab: Schild/Kurzpompfe 85 cm, Stab 110 cm,
        Langpompfe 140 cm, Q-Tip 140 cm und Kette 320 cm.
      </p>
      <dl>
        <dt>Stab</dt>
        <dd>Nahpompfe mit mittlerer Reichweite und frontalem Trefferbogen.</dd>
        <dt>Langpompfe</dt>
        <dd>Lange, einseitige Nahpompfe mit großer Reichweite und frontalem Trefferbogen. Sie teilt sich die Reichweite mit dem Q-Tip, hat aber keine Rückseiten-Trefferfläche.</dd>
        <dt>Q-Tip</dt>
        <dd>Lange zweiseitige Nahpompfe mit großer Reichweite. Sie hat zusätzlich eine kleine Rückseiten-Trefferfläche und bleibt dadurch spielmechanisch von der Langpompfe unterscheidbar.</dd>
        <dt>Schild</dt>
        <dd>Kürzere Nahpompfe. Der Schild erhöht frontal die Blockwirkung der verteidigenden Person; Treffer in den Rücken umgehen diese Blockwirkung.</dd>
        <dt>Kette</dt>
        <dd>
          Sehr große Reichweite mit Mindestabstand für Treffer. Ein gespanntes Kettenband kann nicht von anderen Spielen durchquert werden.
          Ketten können nicht pinnen, geben bei Treffern 8 Strafsteine und bekommen nach erfolgreichem Treffer doppelte Nachladezeit.
          Angriffe können durch Spielende im Weg blockiert werden.
          Wird eine Kette getroffen, bricht ihr laufender Angriff ab. Nahpompfen treffen Ketten immer, sofern Reichweite/Winkel stimmen.
          Pro Team kann höchstens eine Kette gewählt werden.
        </dd>
      </dl>
    </section>

    <section>
      <h2>Strafzeit, Pinnen und Klammern</h2>
      <p>
        Steine laufen global für alle Spielenden gleichzeitig. Nach Ablauf der Strafzeit macht die Person einen kurzen Satz,
        dessen Länge von ihrer Geschwindigkeit abhängt. Während dieses Satzes kann sie nicht schlagen, aber getroffen werden.
      </p>
      <ul>
        <li>Pins werden erst genommen, wenn eine gegnerische Person mindestens 3 Steine abgesessen hat.</li>
        <li>Ketten können nicht pinnen. Andere Pompfen können genau ein Ziel pinnen, und jedes Ziel hat höchstens eine pinnende Person.</li>
        <li>Pinnenden Spielenden ist Bewegung im Pinradius erlaubt. Sie dürfen sich zu aktiven Gegner:innen ausrichten und weiterhin schlagen.</li>
        <li>Läufer:innen können sich am Jugg klammern. Dabei stehen beide Läufer:innen still und am Mal kann kein Punkt gemacht werden.</li>
      </ul>
    </section>

    <section>
      <h2>Calls</h2>
      <p>
        Calls erscheinen als Sprechblase über der rufenden Person. Ob eine empfangende Person reagiert, wird über Wahrnehmung gewürfelt.
        Soweit die rufende Person selbst als aktive empfangende Person beteiligt ist, versteht sie den Call automatisch.
        Wer einen Call nicht wahrnimmt, zeigt kurz ein kleines Fragezeichen über dem Kopf.
        Inaktive Spielende werden aktuell als Empfangende übersprungen. Der Call "Malschutz" kann trotzdem auch von einer inaktiven Person im Team ausgelöst werden.
      </p>
      <p>
        Aktuelle Calls sind:
      </p>
      <dl>
        <dt>Mitkommen!</dt>
        <dd>Trigger: die eigene Läufer:in trägt den Jugg und auf dem Weg zum Mal steht genau eine relevante Person der Gegenseite. Reaktion: ein Teammitglied begleitet den Lauf in Richtung gegnerisches Mal. Endet, wenn die Läufer:in abkniet.</dd>
        <dt>Malschutz!</dt>
        <dd>Trigger: eine gegnerische Läufer:in mit Jugg läuft in der eigenen Hälfte Richtung eigenes Mal oder der freie Jugg liegt näher als 10 Meter am eigenen Mal. Kein Malschutz, wenn diese Läufer:in gepinnt ist. Reaktion: wahrnehmende Teammitglieder laufen zum eigenen Mal; sie brechen ab, wenn die Gefahr weg ist.</dd>
        <dt>Hilf mir!</dt>
        <dd>Trigger: eine Läufer:in klammert oder wird geklammert. Reaktion: das nächste geeignete Teammitglied löst eigene Pins und versucht die gegnerische Läufer:in zu schlagen.</dd>
        <dt>Doppelpin!</dt>
        <dd>Trigger: eine pinnende Pompfer:in kann eine bald aufstehende zweite Person in 95 Prozent der eigenen Pompfenreichweite decken. Reaktion: ein anderer Pin wird auf dem nächsten Stein gelöst, die rufende Person stellt sich zum Abfangen.</dd>
        <dt>Überzahl!</dt>
        <dd>Trigger: eine Pompfer:in gewinnt ein Duell und in der Nähe läuft ein weiteres Duell. Reaktion: das gerufene Teammitglied nimmt für 2 Steine eine defensive Haltung ein (Trefferchancen von und gegen die Person sind verringert), während die rufende Person zum gemeinsamen Angriff kommt.</dd>
      </dl>
    </section>

    <section>
      <h2>Strategien</h2>
      <p>
        Teams können verschiedene Strategien verfolgen, die das Verhalten nach dem Anlaufen bis zur ersten Liniensituation beeinflussen.
      </p>
      <dl>
        <dt>Teamstrategie: Standard</dt>
        <dd>Normales Anlaufen und situatives Entscheiden anhand Jugg, Gegenseite und Calls.</dd>
        <dt>Teamstrategie: Breite Linie</dt>
        <dd>Pompfer:innen laufen breit gefächert Richtung Mittellinie. Die Läufer:in bleibt zuerst bei einem Viertel der Feldlänge.</dd>
        <dt>Teamstrategien: Links Druck / Rechts Druck</dt>
        <dd>Eine Seite bindet defensiv (Trefferchancen von und gegen die Personen sind verringert) die direkte gegnerische Person bis zum Duell oder bis die gegnerische Läufer:in in die eigene Hälfte kommt. Die andere Seite spielt aggressiver: Sie behält normale Trefferchancen, hat aber ein stark verkleinertes Doppelfenster.</dd>
      </dl>
    </section>
  </article>
`
