export const DOCS_HTML = `
  <article class="docs-article">
    <header class="docs-hero">
      <p class="eyebrow">Dokumentation</p>
      <h1>JuggerTopDown</h1>
      <p>
        Diese Dokumentation beschreibt die Simulation, nicht das vollständige Turnierregelwerk.
        Für verbindliche Regeln gilt das aktuelle Regelwerk des Deutschen Jugger-Bunds:
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
        <li>Ein Match endet bei 3 Punkten.</li>
        <li>Der Jugg startet frei in der Mitte und wird von Läufer:innen aufgenommen oder umkämpft.</li>
        <li>Abgeschlagene Spielende knien für eine Strafzeit ab. Normale Treffer geben 5 Steine, Kettentreffer 8 Steine.</li>
        <li>Gepinnte Spielende bleiben unten, bis der Pin regelkonform gelöst wird. In der Simulation kann genau eine Person eine gegnerische Person pinnen.</li>
        <li>Wenn beide Läufer:innen gleichzeitig um den Jugg kämpfen, wird der Besitz über Technik entschieden; bei beidseitigem Erfolg wird der Jugg festgehalten.</li>
        <li>Ein Punkt am Mal ist nicht möglich, solange der Jugg umkämpft oder die Läufer:in geklammert ist.</li>
      </ul>
    </section>

    <section>
      <h2>Adaption und Spielablauf</h2>
      <p>
        Die App ist ein deterministischer Autobattler. Spielende werden nicht direkt gesteuert, sondern entscheiden pro Tick anhand von Rolle,
        Pompfe, Strategie, Calls, Jugg-Situation, Nähe zur Gegenseite und Zustand. Gleicher Seed und gleiche Konfiguration führen zu gleichem Ablauf.
      </p>
      <ul>
        <li>Teams starten links und rechts außerhalb der Grundlinie und laufen zum ersten Kontakt an.</li>
        <li>Zwischen Punkten gibt es eine Strategiepause von 20 Steinen. In den letzten 3 Steinen ist die Aufstellung gesperrt und es zählt groß <code>3</code>, <code>2</code>, <code>1</code>, <code>Jugger!</code> herunter.</li>
        <li>Im Botmodus können Skillung, Pompfen, Positionen und Strategien in der Seitenleiste geändert werden. Im PvP wird die Teamkonfiguration synchron über den Server verteilt.</li>
        <li>Nach der ersten PvP-Setup-Phase ist die Skillung gesperrt; zwischen Zügen werden nur Aufstellung, Pompfen und Strategien geändert.</li>
        <li>PvP blendet Cinema Mode, Seed und manuelle Geschwindigkeit aus, damit beide Clients denselben Ablauf simulieren.</li>
        <li>Cinema Mode ist nur im Botmodus verfügbar und steuert Kamera/Slowmotion für erkannte Highlight-Szenen.</li>
      </ul>
    </section>

    <section>
      <h2>Trefferberechnung und Stats</h2>
      <p>
        Jede spielende Person hat 6 Skillpunkte auf Technik, Geschwindigkeit und Wahrnehmung.
        Technik startet bei 30 und steigt um 10 pro Punkt. Geschwindigkeit startet bei 40 und steigt um 8 pro Punkt.
        Wahrnehmung startet bei 30 Prozent und steigt um 10 Prozentpunkte pro Punkt.
        Läufer:innen nutzen keine komplett eigene Geschwindigkeitsformel, haben aber einen kleinen konstanten Bonus in der gemeinsamen Speed-Berechnung.
      </p>
      <ul>
        <li>Grundchance: Technik der angreifenden Person / (Technik der angreifenden Person + Technik der verteidigenden Person + möglicher Schildbonus).</li>
        <li>Gegen Läufer:innen steigt die Trefferchance stark, weil Läufer:innen nicht blocken.</li>
        <li>Schläge im Laufen sind erlaubt, bekommen aber je nach Pompfe einen Malus.</li>
        <li>Rückentreffer verdoppeln die Chance und ignorieren Schildblock.</li>
        <li>Defensive Haltung reduziert die Trefferchance für beide Seiten. Aggressive Haltung verkleinert vor allem das Doppelfenster.</li>
        <li>Schläge dauern 0,1 Sekunden. Das Doppelfenster bleibt 0,3 Sekunden; wer im Cooldown ist, kann kein Doppel erzeugen.</li>
      </ul>
    </section>

    <section>
      <h2>Grundlegende Entscheidungslogik</h2>
      <p>
        Jede spielende Person wählt laufend ein Ziel. Vorwärtsbewegung ist an Drehgeschwindigkeit gekoppelt; auf der Stelle kann sie sich drehen.
        Im Angriffswindup, beim Klammern, im Jugg-Contest oder beim Abknien wird Bewegung gestoppt.
      </p>
      <ul>
        <li>Läufer:innen laufen zum Jugg, tragen ihn zum gegnerischen Mal oder ziehen sich zurück, wenn der direkte Weg durch gegnerische Reichweiten führt.</li>
        <li>Trägt die laufende Person den Jugg und hat Raum, kann sie Druck über eine Seite suchen. Dabei wird eine gekrümmte Route durch oberes oder unteres Drittel geprüft.</li>
        <li>Pompfer:innen binden aktive Personen der Gegenseite, schützen die eigene Läufer:in, greifen gegnerische Läufer:innen an oder suchen nach ausreichend lange sitzenden Personen zum Pinnen.</li>
        <li>Ketten suchen aktive Personen der Gegenseite. Gibt es keine aktiven Gegner:innen, bewachen sie Abstand zu inaktiven Gegner:innen, pinnen aber nicht.</li>
        <li>Pinnende Spielende dürfen sich im Pinradius bewegen, wenn sie dadurch näher an relevante Gegner:innen kommen, und müssen die gepinnte Person nicht anschauen.</li>
      </ul>
    </section>

    <section>
      <h2>Pompfen, Trefferflächen und Sonderregeln</h2>
      <p>
        Die Reichweiten sind visuell angepasst und nicht als maßstabsgetreue Draufsicht der echten Pompfenlängen gemeint.
        Treffer werden nur geprüft, wenn Ziel, Reichweite und Blickwinkel passen.
      </p>
      <dl>
        <dt>Stab</dt>
        <dd>Solide Nahpompfe mit mittlerer Reichweite, frontalem Trefferbogen und Pin-Fähigkeit.</dd>
        <dt>Q-Tip</dt>
        <dd>Längere Nahpompfe mit größerer Reichweite. Sie hat zusätzlich eine kleine Rückseiten-Trefferfläche.</dd>
        <dt>Schild</dt>
        <dd>Kürzere Nahpompfe. Der Schild erhöht frontal die Blockwirkung der verteidigenden Person; Treffer in den Rücken umgehen diese Blockwirkung.</dd>
        <dt>Kette</dt>
        <dd>
          Sehr große Reichweite mit Mindestabstand, eigener Fluganimation, kreisendem Ball und gespanntem Band während Rückzug.
          Ketten können nicht pinnen, geben bei Treffern 8 Strafsteine und bekommen nach erfolgreichem Treffer doppelte Nachladezeit.
          Angriffe können durch Spielende im Weg blockiert werden. Das Band blockiert Spielende während der Rückzugphase.
          Wird eine Kette getroffen, bricht ihr laufender Angriff ab. Nahpompfen treffen Ketten immer, sofern Reichweite/Winkel stimmen.
          Pro Team kann höchstens eine Kette gewählt werden; keine Kette ist ebenfalls erlaubt.
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
        <li>Normale Treffer geben 5 Steine Strafzeit, Kettentreffer geben 8 Steine.</li>
        <li>Pins werden erst genommen, wenn eine gegnerische Person mindestens 3 Steine abgesessen hat.</li>
        <li>Ketten können nicht pinnen. Andere Pompfen können genau ein Ziel pinnen, und jedes Ziel hat höchstens eine pinnende Person.</li>
        <li>Pinnenden Spielenden ist Bewegung im Pinradius erlaubt; sie dürfen sich zu aktiven Gegner:innen ausrichten und weiterhin schlagen.</li>
        <li>Läufer:innen können sich am Jugg klammern. Dabei stehen beide Läufer:innen still und am Mal kann kein Punkt gemacht werden.</li>
      </ul>
    </section>

    <section>
      <h2>Calls</h2>
      <p>
        Calls erscheinen als Sprechblase über der rufenden Person. Ob eine empfangende Person reagiert, wird über Wahrnehmung gewürfelt.
        Soweit die rufende Person selbst als aktive empfangende Person beteiligt ist, versteht sie den Call automatisch.
        Wer einen Call nicht wahrnimmt, zeigt kurz ein kleines Fragezeichen über dem Kopf.
        Inaktive Spielende werden aktuell als Empfangende übersprungen; Malschutz kann trotzdem auch von einer inaktiven Person im Team ausgelöst werden.
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
        <dd>Trigger: eine Pompfer:in gewinnt ein Duell und in der Nähe läuft ein weiteres Duell. Reaktion: das gerufene Teammitglied nimmt für 2 Steine eine defensive Haltung ein, während die rufende Person zum gemeinsamen Angriff kommt.</dd>
      </dl>
    </section>

    <section>
      <h2>Strategien und Zustände</h2>
      <dl>
        <dt>Teamstrategie: Standard</dt>
        <dd>Normales Anlaufen und situatives Entscheiden anhand Jugg, Gegenseite und Calls.</dd>
        <dt>Teamstrategie: Breite Linie</dt>
        <dd>Pompfer:innen laufen breit gefächert Richtung Mittellinie. Die Läufer:in mit Standard-Läufer:innenstrategie bleibt zuerst bei einem Viertel der Feldlänge.</dd>
        <dt>Teamstrategien: Links Druck / Rechts Druck</dt>
        <dd>Eine Seite bindet defensiv die direkte gegnerische Person bis zum Duell oder bis die gegnerische Läufer:in in die eigene Hälfte kommt. Die andere Seite spielt aggressiver; das Doppelfenster gegen sie wird kleiner.</dd>
        <dt>Läufer:innenstrategie: Breite Mitte</dt>
        <dd>Standardverhalten: Die Läufer:in bleibt im Anlaufen breiter/zentraler, reagiert dann auf Jugg-Besitz und Laufweg.</dd>
        <dt>Läufer:innenstrategie: Direkt zum Jugg</dt>
        <dd>Die Läufer:in sprintet zum Jugg, nimmt ihn, geht bei freiem direktem Weg zum Mal und zieht sich sonst hinter die eigene Linie zurück.</dd>
        <dt>Personenstrategie: Umlaufen</dt>
        <dd>Pompfer:innen versuchen nach einem klaren Ersttreffer früh im Zug, gekrümmt hinter Gegner:innen zu laufen und Rückentreffer zu suchen. Personen im Weg werden trotzdem duelliert.</dd>
        <dt>Defensiv</dt>
        <dd>Schwerer zu treffen, trifft aber selbst schlechter. Entsteht durch Seitendruck-Strategien oder den Überzahl-Call.</dd>
        <dt>Aggressiv</dt>
        <dd>Risiko-orientierter Zustand der nicht-defensiven Seite in Links/Rechts-Druck: weniger Doppel durch stark verkleinertes Doppelfenster.</dd>
      </dl>
    </section>
  </article>
`
