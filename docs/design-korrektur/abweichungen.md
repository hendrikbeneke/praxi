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

## Grundsätzlich — das Markup ist die Quelle, nicht die Prosa der README

Kein Abweichen, sondern die Regel, nach der die Abweichungen bestimmt werden. Das Handoff
besteht aus zwei Teilen: den `*.dc.html`-Prototypen und der README, die sie beschreibt. Wo
beide sich widersprechen, **gilt der Prototyp** — die README ist eine Beschreibung des
Entwurfs, der Prototyp ist der Entwurf.

Dreimal ist das inzwischen aufgefallen, jedes Mal in eine andere Richtung:

- **K1 — Inhaltsbreiten.** Die Liste im Abgleich stammte aus einem `grep` nach `max-width`
  und zählte innenliegende Blöcke mit. Gemessen wurde danach am gerenderten Prototyp.
- **K4 — Titelspalte der Abschnitte.** Die README nennt eine Breite, der Prototyp setzt in
  den Einstellungen 180 px und in der Kontaktakte 200 px. Deshalb ist es ein Prop.
- **K5 — sieben Rasterspalten der Leistungsliste.** Steht so in der README; der Prototyp
  benutzt dasselbe fünfspaltige Raster wie die gebauten Zeilen und hängt Status und die
  beiden Pfeile daneben in dieselbe Flex-Zeile.

Wo ein Paket sich auf die README stützt, wird am Markup gegengeprüft, und wenn beide
auseinandergehen, steht das im Nachweis des Pakets.

---

## K1 — H1 der Kontaktliste: 26 px statt 24 px

**Design:** Die Kontaktliste setzt ihre Seitenüberschrift auf **24 px, Zeilenhöhe 36 px**,
*Kontakt anlegen* auf **22 px** (nachgetragen in K6 — es waren zwei Ausreißer, nicht einer).
Die übrigen Bildschirme setzen **26 px, Zeilenhöhe 1.1**.

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

## K4 — Nummernkreise haben einen Lesemodus

**Design:** Alle Zellen der Nummernkreis-Tabelle sind dauerhaft Eingabefelder; die Karte hat
kein „Bearbeiten".

**Gebaut:** Tabellenform wie im Design, aber jede Zeile zeigt Text, bis ihr eigenes
„Bearbeiten" gedrückt wird.

**Warum:** Es ist das gefährlichste Feld der Anwendung. Ein Vertippen in „nächste Nummer"
vergibt eine Rechnungsnummer erneut, die schon gedruckt ist — und eine festgeschriebene
Rechnung lässt sich nicht korrigieren. „Read mode first" existiert genau für diesen Fall, und
der Kommentar an `NumberRangeRow` sagt es seit D6.

**Falls doch:** `editing` in `NumberRangeRow` auf `true` festnageln und die Aktionsspalte
entfernen.

---

## K4 — Der Hinweis im Abschnitt „Steuern"

Kein Abweichen, sondern ein Vermerk: der Satz „Eines von beiden steht auf jeder Rechnung."
stammt aus dem Design und ist fachlich bestritten — beide Felder können gleichzeitig auf einer
Rechnung stehen, und die Praxis führt heute nur eine Steuernummer. Er ist trotzdem im Wortlaut
des Designs übernommen worden. Wer ihn ändert, ändert keine Struktur.

---

## K1 — Kontrollmaß: nicht gebaut, aber angemerkt

Kein Eintrag, nur ein Hinweis für den nächsten Durchgang: der Prototyp gibt für dieselbe Woche
**KW 32** an, richtig ist **KW 33** (10. August 2026 ist ein Montag in der 33. ISO-Woche).
Gebaut ist die richtige Zahl. Das ist kein Abweichen vom Design, sondern ein Fehler *im*
Design — hier notiert, damit es beim nächsten Vergleich nicht als Befund gegen den Code
auftaucht.

---

## K6 — USt-IdNr. nur bei Organisationen

**Design:** Der Abschnitt „Steuer" erscheint nur, wenn die Art *Organisation* ist, und enthält
*Steuernummer* und *USt-IdNr.*

**Schema:** `contact.vat_id` gilt ausdrücklich für beide Arten — der Kommentar im Datenmodell
sagt „a sole trader is a person and can have a VAT id", und daran ändert sich nichts. Eine
Spalte `tax_number` gibt es auf `contact` nicht und bekommt sie hier auch nicht.

**Gebaut:** wie im Design — der Abschnitt erscheint nur bei Organisationen, mit der USt-IdNr.
als einzigem Feld.

**Warum:** Abgewogen wurde, welcher Fehler häufiger weh tut. Der Einzelunternehmer als Person
mit USt-ID ist der seltene Fall; ein leeres Steuerfeld in jeder Patientenakte ist der
tägliche. Das Schema erlaubt weiterhin beides, nur das Formular zeigt es nicht.

**Folge, die man kennen muss:** Eine Person, bei der eine USt-IdNr. gespeichert *ist* — etwa
aus der Übernahme aus dem Altsystem —, sieht sie im Formular nicht und kann sie dort nicht
ändern. Auf der Rechnung erscheint sie trotzdem.

**Falls doch:** in `components/contact-form.tsx` die Bedingung `kind === 'organization'` um
den Abschnitt „Steuer" entfernen. Ein Feld, kein Umbau.

---

## K6 — Rollen-Raster beim Anlegen: drei feste Spalten

**Design:** *Kontakt anlegen* setzt `repeat(auto-fit, minmax(170px, 1fr))`, die Kontaktakte
`repeat(3, minmax(150px, 220px))`.

**Gebaut:** beide mit den drei festen Spalten der Kontaktakte.

**Warum:** Bei der Breite dieser Seite liefert `auto-fit` ohnehin drei Spalten — dasselbe Bild
in zwei Schreibweisen. Die feste Variante ist die, die es auch bei fünf oder acht Rollenarten
bleibt.

---

## K6 — Die Fußzeile der Kontaktliste erscheint nur, wenn gekürzt wurde

**Design:** „45 von 214 angezeigt · Seitengröße 50" steht unter der Liste, sobald sie Zeilen
hat.

**Gebaut:** nur, wenn die Liste tatsächlich abgeschnitten ist.

**Warum:** „12 von 12 angezeigt · Seitengröße 50" ist keine Aussage. Der Satz beantwortet die
Frage „warum sehe ich nicht alle" — wo sie sich nicht stellt, ist er Rauschen.

---

## K6 — „Ungespeicherte Änderungen" nur, wenn es welche gibt

Kein Abweichen, sondern die konsequente Anwendung der Regel „a form never claims a state that
does not exist": der Prototyp zeigt den Satz in der klebenden Fußzeile, solange bearbeitet
wird. Gebaut hängt er an `isDirty`. Ein Formular, das Änderungen behauptet, die niemand
gemacht hat, ist derselbe Fehler wie eine erfundene Rechnungsnummer — nur kleiner.
