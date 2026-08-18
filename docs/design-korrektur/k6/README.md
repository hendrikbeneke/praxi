# K6 — Kontaktbereich

Kontaktliste, Kopf und Stammdaten der Kontaktakte, Kontakt anlegen. Bilder in diesem Ordner
sind der gebaute Stand, aufgenommen bei 1440 × 950, DPR 2, hell, `de-DE`, `Europe/Berlin` —
dieselbe Zurichtung wie in `docs/design-abgleich/`.

## Gemessen, beide Seiten

Alles unten am gerenderten Prototyp *und* am gebauten Bildschirm gemessen, nicht aus dem
Quelltext erschlossen.

| | Prototyp | Gebaut |
|---|---|---|
| Kopfleiste der Akte: Hintergrund | `oklch(0.996 0.003 85)` (card) | identisch |
| Kopfleiste: Polster, Position, Höhe | `20px 32px 0`, `sticky`, 137 px | identisch |
| H1 der Akte | 26 px / 600 / 28,6 px / −0,572 px | identisch |
| Rollen-Badge unter dem Namen | y 114, Höhe 22 px | identisch |
| Reiter | 13,5 px, Polster `9px 14px`, 2 px Unterkante, aktiv 600 | identisch |
| Rollen-Raster im Bearbeiten-Modus | `220px 220px 220px`, Abstand `12px 20px` | identisch |
| Filterkarte: Suchfeld | 380 × 36 px | identisch |
| Filterkarte: aktiver Reiter | 44 × 32 px, `6px 11px`, Radius 6 px, 13,5 px / 600 | identisch |
| Nr.-Spalte | 80 px, Kopf und Zelle rechtsbündig | 80 px, beide rechtsbündig |
| Fußzeile der Liste | 13 px, `tabular-nums` | identisch |

Die 2 px Versatz in allen x-Werten (266 gegen 268) sind die Breite der Seitenleiste, 234 gegen
236 — ein Rückstand aus D3, nicht aus diesem Paket.

## Drei Funde, die das Paket nebenbei gemacht hat

**1. `ContentWidth` war auf beiden Kontaktbildschirmen 64 px zu schmal.** K1 hatte gemessen,
dass die Kappung im Prototyp auf demselben Element sitzt wie das 32-px-Polster, und daraus
`calc(max − 4rem)` gemacht. Das stimmt für Einstellungen, Leistungen, Zahlungen und Vorgänge
(`<main style="padding:22px 32px 48px;max-width:1180px">`). Auf Kontaktdetail und Kontakt
anlegen sitzt sie **innen**, in einem Bereich, der sein Polster schon hat — 1100 ist dort die
Inhaltsbreite selbst. Gebaut waren 1036 px. Jetzt eine Tabelle statt einer Formel: die beiden
Zahlen bedeuten Verschiedenes und haben keine gemeinsame Regel.

**2. `main` war ein Scrollbereich, der nie scrollte.** Die Hülle stand auf `min-h-svh`, also
wuchs `main` über den Bildschirm hinaus und gescrollt hat das *Fenster*. `overflow-auto` macht
ein Element trotzdem zum Scroll-Container — und damit saß alles Klebende darin in einem
Scrollbereich, der sich nie bewegte: die Kopfleiste der Akte wäre nicht kleben geblieben, die
Fußzeile des Formulars ist gar nicht erst erschienen. Der Prototyp macht es anders herum
(`height:100vh` und `overflow:hidden` um ein `flex:1;overflow:auto`), und so ist es jetzt auch.

**3. Der Kalender stand seit K1 32 px daneben.** Er trug ein `-m-8`, das aus D9 stammt, als
die Hülle diese Route noch polsterte; K1 nahm das Polster weg, das negative Außenmaß blieb.
Dazu `h-[calc(100svh-3.5rem)]` — dieselbe Rechnung von Hand, die falsch werden muss, sobald
sich oben etwas ändert. Jetzt `h-full` in einem Bereich, der eine Höhe hat.
`kalender-nach-korrektur.png` zeigt den Stand danach.

## Zwei Entscheidungen, die im Register stehen

`docs/design-korrektur/abweichungen.md` — die USt-IdNr. erscheint nur bei Organisationen
(Design), obwohl das Schema sie für beide Arten erlaubt; „Ungespeicherte Änderungen" hängt an
`isDirty` statt am Bearbeiten-Modus. Dazu die neue allgemeine Feststellung, dass bei einem
Widerspruch zwischen Prototyp und Handoff-README **das Markup gilt** — mit den drei bisherigen
Fällen.

## Was nicht in K6 war

Der Prototyp lässt die Kontaktliste im Karteninneren scrollen, mit klebendem Tabellenkopf und
einer Karte, die den restlichen Bildschirm füllt. Das ist ein Layoutwechsel der ganzen Seite
und stand auf der Paketliste nicht.
