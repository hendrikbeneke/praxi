# K9 — Vorgänge

Klein. Bild ist der gebaute Stand bei 1440 × 950, DPR 2, hell, `de-DE`, `Europe/Berlin`.

## Gemessen, beide Seiten

| | Prototyp | Gebaut |
|---|---|---|
| Filterleiste | Polster `22px 32px 14px`, Kartenfarbe, `sticky`, Höhe 209 | identisch |
| H1 | 26 px / 600 | identisch |
| Unterkante | 1 px, über die volle Fensterbreite | identisch |

## Die Trennlinie ist der Rand einer Leiste

Titel, Filter, Chips und die Summenzeile sind eine vollbreite, klebende Leiste in Kartenfarbe —
dasselbe Muster wie der Kopf der Kontaktakte aus K6, und daher kommt die Linie. Unter einem
gekappten Block gezeichnet endete sie dort, wo die Liste endet: keine Teilung des Bildschirms,
sondern ein Strich in seiner Mitte. Die Route bekommt darum `p-0` und setzt ihren Einzug selbst.

## Die Namensregel

Umgestellt auf „Nachname, Vorname": die Vorgangsliste und beide Reiter von Zahlungen — beides
Listen, in denen man einen Namen *sucht*. Nicht umgestellt: Kalendereintrag, Kopf der Akte,
Brotkrume, Rechnungsempfänger.

Die Regel steht als Kommentar an `formatContactNameSorted` in `packages/shared`, mit dem
Kalender als Beispiel: er ist auch eine Liste, aber nach der Zeit geordnet, und „Lentz, Mara"
in einem Dienstagsslot wäre eine Karteikarte, die sich als Tag ausgibt. **Nicht „Liste oder
Fließtext", sondern ob die Sortierung nach dem Namen geht.**

Die Empfängerspalte der Rechnungsliste bleibt bei der natürlichen Form — sie zeigt den
eingefrorenen Snapshot, also das, was auf dem PDF steht. Im Register begründet.

## Ein Fehlbefund meines eigenen Abgleichs

Der Wochentagspunkt war schon da: „Mi., 26.08.2026", über `Intl` in `formatBerlinDateLong`,
eine zentrale Stelle. Ohne Punkt schreibt nur die Titelzeile des Kalenders, die den Wochentag
aus `strings.date.weekdays` selbst zusammensetzt — die steht im Abgleich unter D9 und wird in
K10 mitgenommen. Vierter Fall von Prosa gegen Wirklichkeit, diesmal in meiner Liste.

## Nebenbei

Zwei Tests im Server haben die alte Namensform behauptet und sind mitgezogen
(`activity.test.ts`, `invoice.test.ts`) — sie prüfen jetzt „Musterfrau, Erika" bzw.
„Testperson, Erika" und sagen im Kommentar, warum.
