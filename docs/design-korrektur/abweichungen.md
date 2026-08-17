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

## K1 — Kontrollmaß: nicht gebaut, aber angemerkt

Kein Eintrag, nur ein Hinweis für den nächsten Durchgang: der Prototyp gibt für dieselbe Woche
**KW 32** an, richtig ist **KW 33** (10. August 2026 ist ein Montag in der 33. ISO-Woche).
Gebaut ist die richtige Zahl. Das ist kein Abweichen vom Design, sondern ein Fehler *im*
Design — hier notiert, damit es beim nächsten Vergleich nicht als Befund gegen den Code
auftaucht.
