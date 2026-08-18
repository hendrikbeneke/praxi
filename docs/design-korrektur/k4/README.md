# K4 — Nachweis

Sieben Bereiche, links Prototyp, rechts gebaut. 1440 × 950, DPR 2, helles Standardschema.
Jedes Bild geöffnet und gelesen.

## Was die Bilder zeigen

**Praxis ist eine Karte mit sechs Abschnitten**, Titelspalte 180 px, Erläuterung darunter,
Abschnitte durch eine Linie getrennt — statt fünf gleichrangiger Karten ohne Titelspalte. Land
liest „Deutschland", nicht „DE". Die Umsatzsteuer-ID steht neben der Steuernummer. Der sechste
Abschnitt „Rechnungsstellung · Vorbelegung für neue Rechnungen" trägt das Zahlungsziel, das
damit aus dem Bereich Rechnungsstellung verschwunden ist.

**Nummernkreise sind eine Tabelle**: `KREIS · PRÄFIX · STELLEN · NÄCHSTE NUMMER · VORSCHAU`,
eine Zeile je Kreis, Bearbeiten je Zeile. Der ehrliche Zustand bleibt: leere Werte als `—`, und
die Vorschau bleibt `—`, solange Präfix, Stellen und nächster Wert nicht zusammen gültig sind.

**Vorgangsarten** tragen einen Farbpunkt statt eines Farbklotzes mit drei Buchstaben, und die
Zeile sagt wieder, was das Anwenden täte: „12 Minuten" bzw. „ohne übliche Dauer", gefolgt von
den vorbelegten Leistungen.

**Google** hat den Statusstreifen im Kopf, mit allen drei Feldern — `LETZTER FEHLER` ist jetzt
immer eines davon und steht auf `—`, wenn keiner vorliegt. Vorher fehlte das Feld im
fehlerfreien Zustand ganz, was nach Regel 13 falsch herum ist: ein hängender Eintrag muss
benennbar sein, und ein Feld, das bei gutem Zustand verschwindet, kann „nichts ist passiert"
nicht sagen. Die Zeit ist relativ („gerade eben").

**Beziehungen** erklären die Richtung in Worten statt als `A ↔ B`.
**Mailkonto** und **Google** tragen „Bearbeiten" bzw. die Verbunden-Marke im Kartenkopf.
**Die Bereichsspalte** benutzt die kurzen Navigationstexte des Prototyps und bricht nicht mehr
um.

## Zwei Richtigstellungen an meinem eigenen Abgleich

- **Der aktive Bereichseintrag war kein Befund.** Der Prototyp setzt dort
  `color-mix(in oklab, var(--primary) 10%, var(--card))` — also genau `bg-primary/10`, das der
  Build schon hatte. Es wirkt neutralgrau, weil `--primary` mit Chroma 0.028 sehr blass ist;
  im Screenshot hatte ich das als „blaugrauer Ton statt neutral" gelesen. Geblieben ist ein
  Haar: Tailwind mischt gegen die Seitenfläche, der Prototyp gegen `--card` (0,921 gegen 0,933
  Helligkeit). Das ist jetzt exakt.
- **Die Titelspalte ist 180 px, nicht 200.** Die 200 stehen im Handoff-README für die
  Kontaktakte — und dort stimmen sie. `Section` nimmt die Breite deshalb als Prop.

## Was hier noch abweicht, und wohin es gehört

- Textbausteine als eigener Bereich statt in „Rechnungsstellung" — dokumentierte Absicht aus D4.
- Präfix-Platzhalter-Chips unter dem Präfix-Feld — bewusst zurückgestellt (D4).
- Der Kartentitel der Beziehungen heißt „Beziehungen", im Prototyp „Beziehungsarten". Offen.
