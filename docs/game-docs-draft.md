# JuggerTopDown Spieldokumentation

Stand: Mai 2026. Diese Dokumentation beschreibt den aktuellen Stand der Simulation im Repository. Sie ist keine offizielle Regelauslegung, sondern erklärt, wie JuggerTopDown die Jugger-Idee als deterministischen Top-Down-Autobattler abbildet.

Aktuelles offizielles Regelwerk: [jugger.org/downloads](https://www.jugger.org/downloads). Dort ist derzeit die Version `jugger-regeln-20260211.pdf` als aktuelle Fassung verlinkt.

## Kurzfassung Der Relevanten Juggerregeln

Jugger wird in dieser Simulation als 5-gegen-5-Spiel verstanden: eine Läufer:in und vier Pompfer:innen pro Team. Die Läufer:in ist die Spielfigur, die den Jugg tragen und am gegnerischen Mal platzieren kann. Die Pompfer:innen kämpfen mit gepolsterten Spielgeräten, den Pompfen, und versuchen Personen der Gegenseite inaktiv zu machen, Wege freizuräumen oder die eigene Läufer:in zu schützen.

Wichtige Regelideen, die JuggerTopDown verwendet:

- Ein Punkt entsteht, wenn der eigene Läufer:innen den Jugg an das gegnerische Mal bringt.
- Nur Läufer:innen tragen den Jugg.
- Wird eine spielende Person getroffen, muss er eine Strafzeit in Steinen absitzen.
- Eine spielende Person kann eine inaktive gegnerische Person pinnen, sodass diese nach Ablauf der Strafzeit nicht sofort wieder frei wird.
- Bei gegenseitigen Treffern im Doppelfenster entsteht ein Doppel: beide Beteiligten werden inaktiv.
- Läufer:innen können um den Jugg ringen. Solange ein gegnerischer Läufer:innen am Jugg ist oder den tragende Person klammert, kann kein Punkt erzielt werden.
- Ketten haben eine besondere Reichweite und Sonderregeln.

Nicht jeder Detailfall des offiziellen Regelwerks ist im Spiel umgesetzt. Die Simulation konzentriert sich auf Laufwege, Trefferwahrscheinlichkeiten, Pinnen, Klammern, Calls, Pompfenprofile und Teamtaktiken.

## Adaption Im Spiel

JuggerTopDown ist kein manuell gesteuertes Actionspiel. Alle Spielenden handeln automatisch. Die nutzende Person stellt Skillpunkte, Pompfen, Positionen und Strategien ein; danach läuft der Zug als Autobattler.

Ein Match läuft aktuell so:

- Gespielt wird Blau gegen Rot.
- Ein Team gewinnt mit 3 Punkten.
- Die Matchzeit beträgt 180 Sekunden.
- Das Spielfeld ist als 40 x 20 Meter Feld modelliert, in der Draufsicht aber in Pixeln gezeichnet.
- Die Teams starten links und rechts außerhalb der Grundlinie und laufen ins Feld.
- Der Jugg startet in der Mitte.
- Nach einem Punkt beginnt eine Strategiepause von 20 Steinen. Die letzten 3 Steine sind gesperrt und werden als großer Countdown angezeigt.
- Die gewählte Teamstrategie bleibt zwischen den Zügen vorausgewählt und wird erst geändert, wenn die nutzende Person eine andere Strategie auswählt.
- Im Botmodus können Speed, Seed und Cinema Mode genutzt werden.
- Im PvP sind Cinema Mode, Seed und Spielgeschwindigkeit ausgeblendet; der Server synchronisiert Setup, Zugstart und Zugpausen.

In PvP-Matches gibt es eine initiale Setup-Phase. Danach können zwischen den Zügen nur noch Aufstellung, Pompfen und Strategien angepasst werden; Skillung ist dann gesperrt. Team-Config-Änderungen werden über den WebSocket-Server an die Gegenseite übertragen.

## Spielende Und Stats

Jede spielende Person hat 6 Skillpunkte. Diese werden auf drei Werte verteilt:

- Technik: Basis 30, plus 10 pro Skillpunkt.
- Geschwindigkeit: Basis 40, plus 8 pro Skillpunkt.
- Wahrnehmung: Basis 30%, plus 10 Prozentpunkte pro Skillpunkt.

Die tatsächliche Laufgeschwindigkeit wird aus dem Geschwindigkeitswert berechnet und global gedrosselt. Der aktuelle Code nutzt:

```text
speed = (124 + geschwindigkeit * 1.16 + quickBonus) * 0.6
```

Die Läufer:in hat dabei einen kleinen konstanten Bonus. Skillpunkte in Geschwindigkeit wirken für alle Spielenden; Läufer:innen profitieren im Spielgefühl besonders, weil sie häufiger Laufwege zum Jugg oder Mal nehmen.

Wahrnehmung entscheidet, ob eine spielende Person einen Call versteht. Die rufende Person selbst versteht eigene Teamcalls immer dann, wenn er als Empfangende des Calls gesetzt wird.

## Grundlegende Entscheidungslogik

Jeder Simulationsschritt wählt für jede spielende Person ein Ziel, eine Blickrichtung und gegebenenfalls einen Angriff.

Allgemeine Regeln:

- Spielende greifen keine Teammitglieder an.
- Spielende drehen nicht sofort. Eine volle Drehung dauert etwa 0,75 Sekunden.
- Beim Laufen muss die Blickrichtung der Bewegung folgen; auf der Stelle kann gedreht werden.
- Spielende vermeiden Teammitglieder leicht, damit sie sich nicht dauerhaft stapeln.
- Inaktive Spielende bewegen sich nicht, können aber von aktiven Spielenden teilweise als Hindernis wirken.
- Aktive Läufer:innen können durch inaktive Spielende hindurchlaufen, werden dabei aber verlangsamt.

### Läufer:innen Ohne Jugg

Die Läufer:in läuft zum freien Jugg. Wenn beide Läufer:innen gleichzeitig in Reichweite kommen, wird nicht gedoppelt. Stattdessen entscheidet ein Technikduell, wer den Jugg sichert:

- Jedie Läufer:in prüft mit seiner Technikquote gegen die Summe beider Technikwerte.
- Trifft nur einer, bekommt dieser den Jugg.
- Treffen beide, halten beide den Jugg fest und versuchen es nach einem kurzen Cooldown erneut.
- Treffen beide nicht, wird nach kurzem Cooldown erneut versucht.
- Wenn gegnerische Pompfer:innen zu nah werden, können Läufer:innen den Jugg-Konflikt lösen und zurückweichen.

### Läufer:innen Mit Jugg

Hat die Läufer:in den Jugg, prüft er den direkten Weg zum gegnerischen Mal.

- Ist der direkte Weg frei von aktiven Gegner:innen und deren Reichweiten, läuft sie zum Mal.
- Ist der Weg blockiert, zieht er sich zurück.
- Wenn er danach weit genug von gegnerischen Pompfer:innen entfernt ist, versucht er über eine Seite Druck aufzubauen. Er bevorzugt die Seite, auf der mehr eigene aktive Spielende stehen.
- Wenn auch die Seitenroute durch Pompfenreichweite führt, bleibt das Verhalten defensiver und sucht neu.


### Pompfer:innen

Pompfer:innen priorisieren je nach Situation:

- eine direkte gegnerische Person binden oder schlagen,
- den eigenen Läufer:innen unterstützen,
- den gegnerischen Läufer:innen blocken,
- eine inaktive gegnerische Person pinnen,
- auf Calls reagieren,
- als Kette aktive Ziele suchen oder bewachen.

Wenn keine aktiven Gegner:innen mehr stehen, suchen Pompfer:innen ohne Kette nach inaktiven, pinbaren Gegner:innen. Pins werden erst genommen, wenn die gegnerische Person mindestens 3 Steine abgesessen hat. Gegnerische Läufer:innen werden nur als Pin-Ziel genommen, wenn der Jugg frei innerhalb von 5 Metern bei ihnen liegt oder der freie Jugg im eigenen Drittel liegt.

## Pompfen

Die Pompfenwerte sind spielmechanische Top-Down-Werte. Die echten Längen werden nicht 1:1 gezeichnet, weil das aus der Draufsicht unleserlich wäre. Die relativen Ingame-Reichweiten leiten sich aus den Regelmaßen ab: Schild/Kurzpompfe 85 cm, Stab 110 cm, Langpompfe 140 cm, Q-Tip 140 cm und Kette 320 cm.

### Stab

- Ingame-Reichweite: ca. 70 Pixel.
- Trefferfläche: vorderer Schlagbogen.
- Kann pinnen.
- Gegen Läufer:innen: 75 Prozentpunkte Bonus auf Trefferchance, da Läufer:innen nicht blocken.
- Laufangriff: 25 Prozentpunkte Malus.

Der Stab ist der einfache mittlere Standard: gute Reichweite, keine besondere Blockregel, kein Rückraumtreffer.

### Q-Tip

- Ingame-Reichweite: ca. 89 Pixel.
- Trefferfläche: vorderer Schlagbogen plus Rückraumtreffer.
- Kann pinnen.
- Gegen Läufer:innen: 75 Prozentpunkte Bonus.
- Laufangriff: 25 Prozentpunkte Malus.

Der Q-Tip hat eine längere Reichweite als Stab und darf im Code auch nach hinten treffen. Das macht ihn stark gegen Personen, die in den Rücken laufen oder eng um ihn herumstehen.

### Langpompfe

- Ingame-Reichweite: ca. 89 Pixel.
- Trefferfläche: langer vorderer Schlag- und Stichbogen.
- Kann pinnen.
- Gegen Läufer:innen: 75 Prozentpunkte Bonus.
- Laufangriff: 25 Prozentpunkte Malus.

Die Langpompfe teilt sich die maximale Reichweite mit dem Q-Tip, ist aber einseitig. Sie hat deshalb keine Rückseiten-Trefferfläche und ist visuell als längere einseitige Pompfe vom Stab unterscheidbar.

### Schild

- Ingame-Reichweite: ca. 54 Pixel.
- Trefferfläche: kurzer vorderer Schlagbogen.
- Kann pinnen.
- Gegen Läufer:innen: 75 Prozentpunkte Bonus.
- Laufangriff: 18 Prozentpunkte Malus.
- Blockregel: Wenn der schildtragende Person dem Angriff zugewandt ist, wird ein Blockbonus in die Trefferberechnung eingerechnet.

Der Schild ist die defensivste Pompfe. Der Blockbonus verringert die Trefferchance des angreifende Persons, solange der Treffer nicht in den Rücken kommt.

### Kette

- Ingame-Reichweite: ca. 204 Pixel.
- Mindestabstand: sehr nahe Ziele können nicht getroffen werden.
- Trefferfläche: angezeigter Blickwinkel der Kette.
- Kann nicht pinnen.
- Treffer mit Kette geben 8 Strafsteine statt 5.
- Nach einem erfolgreichen Treffer hat die Kette einen doppelt so langen Cooldown.
- Wird eine Kette getroffen, bricht ihr laufender Angriff ab.
- Nicht-Ketten-Pompfer:innen treffen Ketten immer erfolgreich, wenn der Angriff regeltechnisch als Trefferziel gefunden wurde.

Die Kette ist visuell und taktisch besonders:

- Im normalen Zustand kreist der Ball um die Kettenperson.
- Während eines Angriffs fliegt der Ball in Richtung des Zieles und kehrt dann zurück.
- Die Schwunganimation stoppt, wenn die Kette inaktiv ist.
- Der Kettenangriff wird blockiert, wenn eine andere Person zwischen Kette und Ziel steht. Dabei wird etwas mehr als der Spielenden-Körper als Hindernis gerechnet.
- Das Kettenband ist während des Angriffs ein Hindernis: andere Spielende werden davon abgedrängt und können nicht frei durchlaufen.
- Ketten pinnen nicht und sollen keine bereits gepinnten Personen bewachen. Wenn keine aktiven Ziele da sind, bewacht die Kette eine geeignete inaktive, ungepinnte Person aus etwa 90% ihrer Reichweite.
- Sobald wieder ein aktiver Gegner steht, bricht die Kette das Bewachen ab und sucht wieder aktive Ziele.
- Während ihres Cooldowns weicht die Kette zurück, wenn ein gegnerischer Pompfer:innen auf sie zulauft.

Pro Team darf höchstens eine Kette gewählt werden. Keine Kette ist erlaubt.

## Trefferberechnung

Ein Angriff dauert 0,1 Sekunden. Das Doppelfenster bleibt 0,3 Sekunden. Eine spielende Person kann also bereits geschlagen werden, während sein eigener Schlag noch im relevanten Doppelfenster liegt.

Die Grundchance eines Treffers ist:

```text
Trefferchance = Technik angreifende Person / (Technik angreifende Person + Technik verteidigende Person + möglicher Schildbonus)
```

Beispiel: 40 Technik gegen 80 Technik ergibt 40 / 120 = 33,3%.

Modifikatoren:

- Angriff gegen Läufer:innen: Bonus aus dem Pompfenprofil, aktuell meistens +75 Prozentpunkte.
- Angriff im Laufen: Malus aus dem Pompfenprofil.
- Defensive Haltung beim angreifende Person: -15 Prozentpunkte auf eigene Trefferchance.
- Defensive Haltung beim Ziel: -15 Prozentpunkte auf gegnerische Trefferchance.
- Treffer in den Rücken: Trefferchance wird verdoppelt; Schildblock zählt dabei nicht.
- Nicht-Ketten-Pompfer:innen gegen Ketten: Treffer ist immer erfolgreich, sobald Reichweite, Bogen und Zielwahl passen.
- Trefferchance wird auf 2% bis 98% begrenzt.

Eine spielende Person kann nicht doppeln, wenn er im Cooldown ist. Doppel werden als Sprechblasen über beiden Beteiligten angezeigt und beide knien ab.

## Strafzeit, Aufstehen Und Pinnen

Normale Treffer geben 5 Steine Strafzeit. Kettentreffer geben 8 Steine. Steine laufen global für alle gleichzeitig.

Wenn die Strafzeit endet, macht die spielende Person einen kurzen Satz. Die Länge dieses Satzes haengt von seiner Geschwindigkeit ab. Während dieses Aufsteh-Satzes kann er nicht schlagen, kann aber getroffen werden.

Pinnen:

- Nur Pompfer:innen mit pinfähiger Pompfe können pinnen.
- Ketten können nicht pinnen.
- Eine gegnerische Person kann erst gepinnt werden, wenn sie mindestens 3 Steine abgesessen hat.
- Gegnerische Läufer:innen können nur gepinnt werden, wenn der Jugg frei in ihrer Nähe liegt (bis 5 Meter) oder frei im eigenen Drittel liegt. Wenn der Jugg getragen oder umkämpft ist, sind gegnerische Läufer:innen keine Pin-Ziele.
- Pro Ziel gibt es nur einen pinnende Person.
- Ein pinnende Person kann nur ein Ziel pinnen.
- Pinnende Spielende dürfen um die gepinnte Person kreisen, müssen ihn aber nicht anschauen.
- Sie verlassen den Pinradius nicht und drehen sich zu relevanten aktiven Gegner:innen.
- Pins können durch `Hilf mir!`-Situationen oder `Doppelpin!`-Taktik gelöst werden.

## Klammern Die Läufer:in

Wenn ein gegnerischer Läufer:innen den Jugg in der eigenen Hälfte Richtung eigenes Mal trägt, kann der eigene Läufer:innen ihn klammern, sobald er nah genug ist.

Im Spiel bedeutet Klammern:

- Beide Läufer:innen bleiben stehen.
- Der Jugg bleibt umkämpft.
- Am Mal kann kein Punkt gemacht werden, solange geklammert wird.
- Beide beteiligten Läufer:innen können `Hilf mir!` callen.
- Wenn Abstand, Zustand oder Jugg-Besitz nicht mehr passen, löst sich das Klammern.

## Calls

Calls sind Teamkommunikation. Die rufende Person bekommt eine Sprechblase. Wenn ein Empfangende den Call nicht wahrnimmt, erscheint ein kleines Fragezeichen über dem Kopf.

Wahrnehmung:

- Jeder Empfangende prüft gegen seinen Wahrnehmungswert.
- Die rufende Person selbst besteht die Wahrnehmungsprüfung, wenn er als Empfangende des Calls gilt.
- Aktuell werden inaktive Spielende als Empfangende übersprungen. Malschutz kann aber auch von einer Person ohne Aktivitaetsfilter ausgelöst werden.

### `Mitkommen!`

Trigger:

- Der eigene Läufer:innen trägt den Jugg.
- Auf dem Weg Richtung gegnerisches Mal steht genau eine gegnerische Person im Call-Korridor.
- Die Läufer:in hat keinen Call-Cooldown.

Reaktion:

- Der nächste eigene aktive Pompfer:innen folgt als Support.
- Er bewegt sich in eine unterstützende Position in Richtung gegnerisches Mal.
- Der Call endet, wenn die Läufer:in nicht mehr tragende Person ist oder inaktiv wird.

### `Malschutz!`

Trigger:

- Der gegnerische Läufer:in trägt den Jugg in der eigenen Hälfte Richtung eigenes Mal.
- Oder: Der Jugg liegt frei und ist näher als 10 Meter am eigenen Mal.
- Kein Malschutz, wenn die gegnerische Läufer:in bereits gepinnt ist.
- Pro Team gibt es einen Call-Cooldown.

Reaktion:

- Wahrnehmende Teammitglied laufen zum eigenen Mal.
- Wenn ein Pompfer:innen bereits näher am eigenen Mal ist als der gegnerische tragende Person, beendet er die Malschutzreaktion und dreht sich wieder zum Spiel.
- Wenn der Jugg nicht mehr beim erwarteten gegnerischen tragende Person ist oder bei freiem Jugg wieder vom eigenen Team kontrolliert wird, endet die Reaktion.

### `Hilf mir!`

Trigger:

- Ein Läufer:innen klammert oder wird geklammert.
- Die Läufer:in hat keinen Call-Cooldown.

Reaktion:

- Der nächste aktive eigene Pompfer:innen wird gerufen.
- Er läuft zum gegnerischen Läufer:innen im Klammern und versucht ihn zu schlagen.
- Wenn ein pinnendie spielende Person diesen Call annimmt, kann er seinen Pin lösen.

### `Doppelpin!`

Trigger:

- Ein pinfähiger Pompfer:innen pinnt gerade.
- Ein anderer eigener Pompfer:innen pinnt in der Nähe einen zweiten gegnerischen Pompfer:innen.
- Der Zielperson des zweiten Pins ist fast wieder frei.
- Die Entfernung passt zu 95% der Reichweite der Pompfe des rufende Persons.

Reaktion:

- Der zweite pinnende Person löst seinen Pin auf dem nächsten Stein.
- Die rufende Person positioniert sich so, dass sie die aufstehende Person schlagen kann.
- Der frei gewordene eigene Pompfer:innen sucht sich ein neues Ziel.

### `Überzahl!`

Trigger:

- Ein Pompfer:innen gewinnt ein Duell eindeutig.
- In der Nähe findet ein weiteres Duell statt: eine eigene Pompfer:in und eine gegnerische Person sind in gegenseitiger Schlagreichweite.

Reaktion:

- Die rufende Person läuft zur gegnerischen Person im Nachbarduell.
- Der gerufene eigene Pompfer:innen bekommt für 2 Steine, also 3 Sekunden, eine defensive Haltung.
- Wenn das gerufene Teammitglied den Call nicht wahrnimmt, erscheint das Fragezeichen.

## Strategien

Teamstrategien beeinflussen vor allem das Anlaufen und einzelne taktische Entscheidungen.
Die aktuell gewählte Teamstrategie bleibt zwischen Zügen bestehen; in der Strategiepause kann sie für den nächsten Zug geändert werden.

### Teamstrategien

`Standard`

- Normales Verhalten ohne besondere Seitenvorgabe.

`Breite Linie`

- Pompfer:innen laufen breit gefächert näher an die Mittellinie.
- Blau orientiert sich etwa bis 17 Meter Feldlänge, Rot etwa bis 23 Meter.

`Rechts Druck`

- Die obere Seite spielt defensiver.
- Die andere Seite spielt aggressiver.

`Links Druck`

- Die untere Seite spielt defensiver.
- Die andere Seite spielt aggressiver.

Defensive Seitenstrategie:

- Die spielende Person läuft trotzdem bis zur relevanten gegnerischen Person und bindet sie.
- Die defensive Haltung endet pro Person, wenn der gegenüberliegende Person ab ist oder die gegnerische Läufer:in in der eigenen Hälfte ist.
- Defensive Haltung macht eigene Treffer unwahrscheinlicher, aber auch gegnerische Treffer gegen diese Person unwahrscheinlicher.

Aggressive Seitenstrategie:

- Die aggressive Person bekommt kein direktes Trefferplus.
- Ihr Vorteil ist ein stark verkleinertes Doppelfenster bei der gegnerischen Person, wodurch eindeutige Treffer wahrscheinlicher werden.


## Zustände

`Aktiv`

- Die spielende Person läuft, entscheidet, kann schlagen und Calls wahrnehmen.

`Inaktiv`

- Die spielende Person sitzt Strafsteine ab, bewegt sich nicht, greift nicht an und kann gepinnt werden.

`Gepinnt`

- Die spielende Person bleibt inaktiv, solange ein pinnende Person regeltechnisch am Pin bleibt.

`Pinnend`

- Die spielende Person hält einen Pin, kann sich im Pinradius bewegen und kann weiterhin schlagen.

`Klammernd / Geklammert`

- Läufer:innen halten den Jugg umkämpft. Beide bewegen sich nicht.

`Defensiv`

- Reduziert die Trefferchance des eigenen Angriffs und die Trefferchance gegen diese Person jeweils um 15 Prozentpunkte.

`Aggressiv`

- Verkleinert das gegnerische Doppelfenster bei Angriffen der aggressiven Person.

`Cooldown`

- Die spielende Person kann nicht erneut schlagen und kann auch nicht doppeln.
- Bei Ketten ist der Cooldown nach erfolgreichem Treffer doppelt so lang.

`Recovery Dash`

- Kurzer Satz nach abgesessener Strafzeit; Geschwindigkeit beeinflusst die Dash-Länge.

## Cinema Mode

Der Cinema Mode ist nur für Botspiele gedacht. Er zoomt automatisch auf interessante Szenen und nutzt Slowmotion. Im PvP ist er deaktiviert, damit beide Spielenden dieselbe neutrale Ansicht und keine lokale Speed-Manipulation haben.

Erkannte Highlighttypen sind unter anderem:

- eine spielende Person gewinnt alleine gegen zwei,
- ein Läufer:innen macht unter Druck den Jugg,
- eine spielende Person trifft mehrere gegnerische Personen in kurzer Stein-Zeit,
- ein Schlag nach einem Läufer:innen verfehlt knapp.

## Bekannte Modellgrenzen

- Die offiziellen Pompfenlängen werden nicht maßstabsgetreu gezeichnet.
- Die Simulation bildet keine echte menschliche Koordination ab; Calls sind Wahrscheinlichkeitsentscheidungen.
- Die Wahrnehmungslogik überspringt derzeit inaktive Empfangende, obwohl frühere Designideen vorsahen, dass auch inaktive Spielende Calls wahrnehmen können.
- Es gibt keine manuelle Steuerung der Spielenden.
- Offizielle Regelbereiche außerhalb der Kernsimulation, etwa Turnierorganisation, Sicherheitsdetails oder vollständige Pompfenprüfungen, sind nicht Teil dieser App-Dokumentation.
