# Abschluss des Abgleichs

`README.md` in diesem Ordner ist der Befundstand vom Abgleichdurchgang. Diese Datei sagt, was
aus jeder Zeile geworden ist — abgearbeitet in welchem Paket, bewusst offen, oder als Fehlbefund
zurückgenommen. Die Korrekturpakete selbst stehen in `WORKPLAN.md` unter K1–K10, ihre Nachweise
in `../design-korrektur/`.

Drei Ergebnisse vorweg:

- **Von den fünf gemeinsamen Ursachen sind alle fünf behoben.** Sie waren der Grund, warum so
  viele Einzelbefunde zusammenhingen — eine Hülle ohne Inhaltsbreite, ein zu kleiner Seitenkopf,
  eine zu große Listenkopfzeile, ein Lesemodus aus Feldkästen, fehlende Zusammenfassungszeilen.
- **Drei Befunde waren falsch, und zwar meine.** Sie stehen unten mit dem Messergebnis, das sie
  widerlegt.
- **Zwei Befunde bleiben offen**, beide begründet, beide keine Layoutfragen.

---

## Die fünf gemeinsamen Ursachen

| | behoben in |
|---|---|
| 1 · Seitenhülle ohne Inhaltsbreite, zu viel Kopfabstand | K1 (`lib/page-chrome.ts`, `ContentWidth`) — Breite in K6 nachkorrigiert |
| 2 · `PageHeader` zu klein, kein dritter Slot | K1 |
| 3 · Listenkopfzeile eine Stufe zu groß | K1, für die Rechnungstabelle noch einmal in K8 |
| 4 · Lesemodus zeigt Eingabefelder | K2 (`ReadValue`) |
| 5 · Zusammenfassungs- und Filterzeile über den Listen | K3, korrigiert in K7 (sie filtern) und K8 (Zahl vorn) |

## Je Bildschirm

**D3 — Navigation.** Zwei Befunde, beide offen — siehe unten. Der Rest war der genaueste Nachbau
im ganzen Paket und blieb unberührt.

**D4 — Einstellungen.** Alles behoben in K4: eine Karte statt fünf, Abschnittserläuterungen,
Nummernkreis-Tabelle, Farbtupfer statt Farbklotz, Vorbelegung in der Zeile, Beziehungsrichtung
als Satz, kürzere Bereichshinweise, „Bearbeiten" zurück in den Kartenkopf, Google-Statusstreifen
mit drei Feldern im Kopf und relativer Zeitangabe. Der Befund „aktiver Bereich `bg-primary/10`
statt neutralem Grau" hat sich schon im Abgleich selbst erledigt: der Prototyp benutzt dieselbe
Mischung, sie wirkt nur neutral, weil `--primary` fast keine Buntheit hat.

**D5 — Leistungen.** Alles behoben in K5. Die vorgegebenen „sieben Rasterspalten" gab es nur in
der Handoff-Prosa; der Prototyp benutzt dasselbe fünfspaltige Raster wie der Build — gefehlt
haben drei Zellen in der Kopfzeile.

**D6 — Kontaktbereich.** Kontaktliste, Kopf und Stammdaten in K6; Notizen, Vorgänge, Rechnungen
und Übersicht der Akte in K7. Vollständig.

**D7 — Zahlungen.** Alles behoben in K8, einschließlich der beiden Kacheln als Reiterumschalter
und der zusammengeführten Statusspalte.

**D8 — Vorgänge.** Kontaktnamen und Trennlinie in K9. Der dritte Befund war falsch — siehe unten.

**D9 / D9.5 — Kalender.** Behoben in K10: getönte Blöcke, Chipzeile und Legende raus, Karte
„Nächste freie Zeit", Regel für den Überblickstag, Kennzahl-Beschriftungen, beide Titelformate,
freie Dauern, „Neuer Termin" ohne Umbruch. Der Auswahl-Ton war ein Fehlbefund. Die Anmerkung zur
Kalenderwoche bleibt, was sie war: dort irrt der Prototyp, gebaut ist die richtige Zahl — die
Bilder der zweiten Runde zeigen denselben Fehler (KW 32 für den 10.08.2026, KW 33 für den
17.08.), womit er zweimal unabhängig bestätigt ist.

**Nachtrag: der Kalender ist in der zweiten Runde neu entschieden worden** und ist der einzige
Bildschirm, für den diese Datei nicht der letzte Stand ist. Vier der unter „A" als *bewusst
abweichend* geführten Zeilen sind seit D-K2 zurückgedreht — zwei Spalten sind jetzt drei, das
Raster öffnet auf 08:00 statt 07:00, der Terminfinder ist kein dritter Zustand der Leiste mehr
sondern steht dauerhaft links, und die fehlende Monats- und Listenansicht ist kein „drei statt
fünf" mehr, sondern beauftragt (K4). Maßgebend sind dafür nicht mehr Prototyp und Abgleich,
sondern `docs/design-korrektur-2/01 - Kalender/Desired Screens/`; der Stand steht in
`WORKPLAN.md` unter „Design-Korrektur 2".

---

## Was offen bleibt, und warum

**1 · Die globale Suche in der Kopfzeile.** Bewusst ausgesetzt, als einzige feste Ausnahme des
ganzen Durchgangs: „Die globale Suche in der Kopfzeile bleibt weg, bis sie tatsächlich gebaut
wird." Ein Feld, das aussieht wie eine Suche und keine ist, wäre dasselbe Muster wie der
Briefbogen-Knopf, der 404 antwortete. Sie ist kein Layoutrückstand, sondern eine ungebaute
Funktion — sie gehört in einen Slice, nicht in ein Korrekturpaket.

**2 · Die zweite Brotkrumen-Ebene außerhalb der Kontakte.** Der Prototyp schreibt „Einstellungen
/ Praxis", „Einstellungen / Vorgangsarten"; gebaut steht dort nur „Einstellungen". Nicht
behoben, weil die Entscheidung dahinter noch nicht getroffen ist: `useSecondBreadcrumbSegment()`
nennt seine beiden Routen heute direkt und sagt im Kommentar, warum — „Build that the day a
*second* screen wants a second segment". Genau dieser Tag wäre das. Es ist also keine
vergessene Zeile, sondern der Punkt, an dem aus zwei Sonderfällen ein Mechanismus wird, und das
ist eine Entscheidung, keine Korrektur. Der Bereich steht ohnehin im URL-Suchparameter, die
Information fehlt niemandem.

---

## Drei Fehlbefunde

Alle drei aus meiner Liste, nicht aus dem Handoff.

**1 · „Wochentag mit Punkt" (D8).** Der Punkt stand längst — `formatBerlinDateLong` geht über
`Intl` mit `weekday: 'short'`, und das deutsche Kurzformat hat ihn. Ohne Punkt schrieb allein die
Titelzeile des Kalenders, die ihn aus `strings.date.weekdays` selbst zusammensetzte; die ist in
K10 auf die Langform umgestellt.

**2 · „Kein Auswahl-Ton auf der Spalte des gewählten Tags" (D9).** Der Prototyp tönt keinen
gewählten Tag. Er tönt **heute**: `spalteBg` gibt allein `heuteIso` einen Ton (`primary 3 %`),
die Kopfzelle `primary 8 %`. Gebaut stand genau das.

**3 · „Kennzahl-Labels: belegt → Stunden" (D9).** Die Pfeilrichtung war verkehrt: der Prototyp
sagt „belegt" und „Absagen", gebaut stand „Stunden" und „Abgesagt". **Dieser Fehler ist einmal
durch den Prompt gelaufen** — die Anweisung für K10 übernahm die Zeile ungeprüft. Auch eine
Anweisung ist eine Behauptung über das Design, solange sie aus einer Liste stammt und nicht aus
dem Markup.

---

## Was der Durchgang über die Methode gelernt hat

Vier Dinge, die in `docs/design-korrektur/abweichungen.md` ausführlicher stehen:

- **Das Markup ist die Quelle, nicht die Prosa** — dreimal gingen Handoff-README und Prototyp
  auseinander (Inhaltsbreiten, Titelspalte, Rasterspalten), zweimal irrte meine eigene Liste,
  einmal lief der Irrtum durch die Anweisung.
- **Ein Screenshot beweist nur, was der Server gerade ausliefert.** Zweimal zeigte ein Bild den
  alten Stand — einmal wegen eines veralteten `packages/shared/dist`, einmal wegen eines
  Vite-Modulcaches.
- **Eine handgeschriebene Fensterrechnung wird falsch**, sobald oben etwas seine Höhe ändert.
  Der Kalender stand deshalb seit K1 32 px daneben.
- **Wer eine gespeicherte Auswahl halb übernimmt, führt eine Ordnung weiter, die niemand mehr
  gewählt hat.**
