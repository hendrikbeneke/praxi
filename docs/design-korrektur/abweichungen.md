# Bewusste Abweichungen vom Design

Ein auffindbares Register für „das Design sagt X, gebaut ist Y, und zwar absichtlich". Der
Maßstab der Korrekturpakete ist, dass **das Design maßgebend ist** — dieses Register ist
deshalb kurz und soll es bleiben. Wer hier einen Eintrag findet, der doch Absicht war, kann ihn
zurückdrehen; der Punkt der Liste ist, dass die Entscheidung nicht in einem Commit-Text
verschwindet.

Nicht hierher gehören die Abweichungen, die schon in `WORKPLAN.md` unter D1–D10 begründet
stehen, und nicht die noch offenen Befunde aus `docs/design-abgleich/` — das sind Rückstände,
keine Entscheidungen.

---

## K1 — H1 der Kontaktliste: 26 px statt 24 px

**Design:** Die Kontaktliste setzt ihre Seitenüberschrift auf **24 px, Zeilenhöhe 36 px**. Alle
sieben anderen Bildschirme setzen **26 px, Zeilenhöhe 1.1**.

**Gebaut:** überall 26 px / 1.1.

**Warum:** Vermutlich ein Überbleibsel aus dem Entwurfsprozess, der über mehrere Tage in vielen
Einzelschritten entstand — nicht Absicht. Eine Seitenüberschrift, die auf einem von acht
Bildschirmen kleiner ist, liest sich als Versehen, und `PageHeader` ist eine Komponente: die
Ausnahme hätte einen Sonderfall für genau eine Route gebraucht.

**Falls doch Absicht:** `components/page-header.tsx` bekäme einen Modus für die Listenseite.
Nachmessbar in `docs/design-abgleich/vergleich/D6-kontaktliste.png`, linke Hälfte.

---

## K3 — Zahl hinter dem Wort, auch bei den Chips

**Design:** Auf den Reitern von *Leistungen* steht die Zahl **hinter** dem Namen
(„Leistungen 9", gedämpft). Auf jedem anderen Chip steht sie **davor** („3 Gesperrt",
„9 Alle", Zahl in 600).

**Gebaut:** überall hinter dem Wort.

**Warum:** Vereinheitlicht per Entscheidung. Zwei Stellungen für dasselbe Muster heißen,
dass man bei jedem Chip erst erkennen muss, welche Sorte er ist. Der Reiter behält damit
seine Leserichtung („Bereich, dann Menge"), und die Zähl-Chips lesen sich genauso.

**Nicht betroffen ist die Prosa-Zeile** daneben: „4 Notizen", „8 Vorgänge · 3 kommend",
„14 Vorgänge · 5 kommend · 185,50 € noch nicht abgerechnet" bleiben Prosa — „Notizen 4"
wäre kein Deutsch.

**Falls doch getrennt gewollt:** `components/chip.tsx` ist die einzige Stelle; `CountChip`
und `filterChipClass` müssten die Reihenfolge als Parameter nehmen.

---

## K3 — Zähl-Chips sind keine Knöpfe

**Design:** Die Zähl-Chips über den Kontakt-Reitern sind `<button>`.

**Gebaut:** `<span>`.

**Warum:** Sie filtern nichts. Geprüft am Prototyp — ein Klick auf „3 Gesperrt" verschiebt
nur die Auswahl, die Liste bleibt vollständig, und die Zustandsliste des Handoffs nennt für
diese Reiter keinen Filter. Ein Bedienelement ohne Funktion ist dasselbe Muster wie der
Briefbogen-Knopf, der 404 antwortete, und wie die Kopfzeilen-Suche, die deshalb draußen
bleibt.

**Falls sie filtern sollen:** dann werden es echte Knöpfe mit Zustand, und die Null bleibt
sichtbar — bei einem Filter ist sie eine Aussage, bei einer Zählung nur Rauschen. Heute
werden Chips mit `0` weggelassen.

---

## K1 — Kontrollmaß: nicht gebaut, aber angemerkt

Kein Eintrag, nur ein Hinweis für den nächsten Durchgang: der Prototyp gibt für dieselbe Woche
**KW 32** an, richtig ist **KW 33** (10. August 2026 ist ein Montag in der 33. ISO-Woche).
Gebaut ist die richtige Zahl. Das ist kein Abweichen vom Design, sondern ein Fehler *im*
Design — hier notiert, damit es beim nächsten Vergleich nicht als Befund gegen den Code
auftaucht.
