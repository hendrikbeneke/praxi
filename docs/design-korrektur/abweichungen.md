# Bewusste Abweichungen vom Design

Ein auffindbares Register für „das Design sagt X, gebaut ist Y, und zwar absichtlich". Der
Maßstab der Korrekturpakete ist, dass **das Design maßgebend ist** — dieses Register ist
deshalb kurz und soll es bleiben. Wer hier einen Eintrag findet, der doch Absicht war, kann ihn
zurückdrehen; der Punkt der Liste ist, dass die Entscheidung nicht in einem Commit-Text
verschwindet.

Nicht hierher gehören die Abweichungen, die schon in `WORKPLAN.md` unter D1–D10 begründet
stehen, und nicht die noch offenen Befunde aus `docs/design-abgleich/` — das sind Rückstände,
keine Entscheidungen.

**Seit der zweiten Design-Korrektur gilt eine andere Rangfolge, und sie schlägt dieses
Register.** Die Bilder in `docs/design-korrektur-2/<Bildschirm>/Desired Screens/` sind die
Vorgabe; sie stehen über dem Handoff-Prototyp, über `docs/design-abgleich/` und über allem, was
hier steht. Für einen Bildschirm, den diese Runde abgedeckt hat, ist ein Eintrag hier also nur
noch dann gültig, wenn die Bilder ihm nicht widersprechen — und wo sie es tun, wird der Eintrag
zurückgedreht statt verteidigt. Der Kalender ist der erste Fall; siehe unten.

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

Dazu kommen zwei Fälle, in denen **meine eigene Abgleichliste** irrte, nicht das Handoff:

- **K9 — der Wochentagspunkt.** Der Abgleich führte „Mi., 26.08.2026 statt Mi, 12.08.2026"; der
  Punkt stand längst, aus `Intl`. Nachgemessen am Bildschirm.
- **K10 — die Kennzahl-Beschriftungen.** Der Abgleich schrieb „belegt → Stunden", also die
  Pfeilrichtung verkehrt: der Prototyp sagt „belegt" und „Absagen", gebaut stand „Stunden" und
  „Abgesagt". **Der Fehler ist dabei einmal durch den Prompt gelaufen** — die Anweisung für K10
  übernahm die Abgleichzeile ungeprüft. Auch eine Anweisung ist eine Behauptung über das
  Design, solange sie aus einer Liste stammt und nicht aus dem Markup.

Wo ein Paket sich auf die README oder auf den Abgleich stützt, wird am Markup gegengeprüft, und
wenn beide auseinandergehen, steht das im Nachweis des Pakets.

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

## ~~K3 — Zahl hinter dem Wort, auch bei den Chips~~ → in K8 zurückgenommen

**Auch dieser Eintrag war ein Fehler, und es war meine Entscheidung, nicht seine Umsetzung.**
Ich hatte in K3 aus einem Gefühl heraus vereinheitlicht — überall die Zahl hinter dem Wort —,
ohne den Prototyp konsequent zu lesen. Genau das, was seither die Grundregel dieser Pakete
verbietet.

**Die Trennung des Designs trägt inhaltlich**, und deshalb gilt sie wieder:

- **Filter-Chip: Zahl vorn** — „3 Offen". Dort *ist* die Zahl die Aussage: wie viele Zeilen
  mich erwarten, wenn ich das drücke.
- **Reiter: Zahl hinten** — „Leistungen 9". Dort ist der Name die Aussage und die Zahl eine
  Nebenangabe zu dem Ort, an den er führt.

Zwei Rollen, zwei Stellungen. Das ist kein Versehen im Entwurf, sondern eine Unterscheidung.

**Umgestellt in K8:** Zahlungen und die praxisweite Vorgänge-Seite. **Nicht umgestellt:** die
Reiter von Leistungen (K5) und die Chip-Zeilen der Kontakt-Reiter (K7) — die bleiben hinten.

**Aufgelöst in K9:** die Chips der Kontakt-Reiter sind seit K7 Filter, der Prototyp setzt die
Zahl dort ebenfalls vorn („3 Gesperrt", `Kontaktdetail.dc.html`) — also greift die Regel und
sie stehen jetzt vorn. Der erste Beschluss hatte sie noch als Reiter geführt. Damit ist die
Stellung überall aus der Rolle abgeleitet und nirgends aus der Gewohnheit.

---

## ~~K3 — Zähl-Chips sind keine Knöpfe~~ → in K7 zurückgenommen

**Der Eintrag war falsch, und zwar in der Beobachtung, nicht in der Schlussfolgerung.**

K3 hatte notiert: „Sie filtern nichts. Geprüft am Prototyp — ein Klick auf ‚3 Gesperrt' verschiebt
nur die Auswahl, die Liste bleibt vollständig." Verschoben wird die Auswahl tatsächlich, das war
richtig gesehen. Gefiltert wird aber auch:

```js
const notizTrifft = n => { const f = st.nzFilter; if (!f) return true; … }
const sichtbareNotizen = NOTIZEN.filter(notizTrifft)
```

Dasselbe gilt für `vgFilter` (Vorgänge) und `reFilter` (Rechnungen). Ich habe die eine Wirkung
gesehen und daraus geschlossen, dass es die andere nicht gibt.

**Gebaut ist seit K7 das, was der Prototyp macht:** die drei Chip-Zeilen sind echte Filter
(`filterChipClass`, dieselbe Form wie auf Zahlungen und der Vorgänge-Seite), sie schalten sich
durch erneutes Klicken wieder ab, und **die Null bleibt stehen** — bei einem Filter ist
„Überfällig 0" eine Antwort, bei einer bloßen Zählung wäre sie Rauschen. `CountChip` hatte damit
keinen Aufrufer mehr und ist gelöscht.

**Was von K3 bleibt:** die Zahl steht weiter *hinter* dem Wort. Der Prototyp setzt sie auf diesen
Chips davor und auf den Leistungen-Reitern dahinter; eine Reihenfolge für eine Form ist mehr wert
als beide.

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

---

## K7 — Die Lesespalte der Notizen liest, geschrieben wird im Dialog

**Design:** Die rechte Spalte des Notizen-Reiters ist zugleich der Editor — ein
`contentEditable` mit Formatleiste, in dem eine Notiz angelegt und bearbeitet wird.

**Gebaut:** Die Lesespalte liest. „Neue Notiz", „Bearbeiten" und „Nachtrag" öffnen den Dialog —
den der Prototyp **selbst danebenstellt**, mit denselben Feldern (Datum, Art, Zum Vorgang, Text).
Wir bauen also die zweite Hälfte des Prototyps, nicht etwas Drittes.

**Warum:** CLAUDE.md verbietet `contentEditable` für Notiztext ausdrücklich, und das ist hier
keine Formalie. Ein `contentEditable` erzeugt Markup, das niemand geschrieben hat — je nach
Browser anderes —, und **genau dieser Text wird gehasht und gesperrt**: § 630f BGB verlangt, dass
die ursprüngliche Fassung erkennbar bleibt, und die Hash-Kette in `note.content_hash` steht dafür
ein. Was in einem gesperrten Feld liegt, muss das sein, was die Behandlerin geschrieben hat.

**Falls doch:** dann nicht mit `contentEditable`, sondern mit der Textarea aus
`components/note-editor.tsx` an der Stelle der Lesespalte. Die Regel bliebe gewahrt, es wäre nur
mehr Arbeit als ein Dialog, den es schon gibt.

---

## K7 — „noch nicht abgerechnet" statt „seit der letzten Rechnung"

**Design:** Die Karte über der Rechnungsliste sagt „3 Vorgänge seit der letzten Rechnung".

**Gebaut:** „3 Vorgänge, noch nicht abgerechnet".

**Warum:** Der Satz des Prototyps behauptet etwas, das aus den Daten nicht folgt. Abrechenbar ist,
was auf keiner aktiven Rechnung steht — und das kann älter sein als die letzte Rechnung, etwa
wenn ein Vorgang beim Sammeln übersehen wurde oder eine Rechnung storniert worden ist. Der Satz
passte zu den Beispieldaten, nicht zur Regel.

---

## K8 — Die klebende Fußzeile über den offenen Vorgängen bleibt

**Design:** Abgerechnet wird ausschließlich je Kontakt, über einen Knopf in der Kopfzeile der
Kontaktgruppe. Eine Fußzeile über alle Kontakte gibt es nicht.

**Gebaut:** beides. Der Gruppenknopf kam in K8 dazu, die klebende Fußzeile bleibt daneben.

**Warum:** Beide Wege haben ihren Fall — ein Kontakt sofort abgerechnet, oder mehrere in einem
Zug gesammelt. Der zweite ist außerdem eine Zusage aus Regel 6: „All contacts in one
transaction: a half-finished collect would leave the practitioner guessing which ones still
need doing." Dahinter steht dieselbe Funktion, `collectBillableItems()`; die beiden Knöpfe
unterscheiden sich nur in der Zahl der ids, die sie mitgeben. Dass die Fußzeile klebt und nicht
im Seitenkopf steht, ist eine D7-Entscheidung: mit vielen Kontakten scrollte der Knopf genau
dann weg, wenn die Auswahl interessant wurde.

**Falls doch nur der Gruppenknopf:** die Fußzeile in `components/billable-list.tsx` entfernen;
`confirming` kennt dann nur noch eine Kontakt-id und nie `'all'`.

---

## K9 — Die Empfängerspalte der Rechnungsliste bleibt „Vorname Nachname"

**Design:** Auch dort „Dohrmann, Til", wie in jeder anderen Liste.

**Gebaut:** die natürliche Form.

**Warum:** Die Spalte heißt „Empfänger" und meint **das Dokument**, nicht den Kontakt. Bei einer
festgeschriebenen Rechnung ist der Wert der eingefrorene `recipient_snapshot` — dieselbe
Zeichenkette, die als Anschrift auf dem PDF steht. Schriebe die Liste sie anders, widersprächen
sich Liste und Dokument; das ist die Sorte Widerspruch, die bei einer Betriebsprüfung erklärt
werden muss. Der Snapshot speichert außerdem nur den fertigen Namen, keine Namensteile: sortiert
zeigen hieße ihn zerlegen oder aus dem *lebenden* Kontakt neu bilden — und dann stünde in der
Liste ein Name, den die Rechnung nicht trägt.

**Alle anderen Listen sind umgestellt** — Vorgänge und beide Reiter von Zahlungen. Die Regel,
nach der entschieden wird, steht als Kommentar an `formatContactNameSorted` in
`packages/shared`: nicht „Liste oder Fließtext", sondern ob die Sortierung nach dem Namen geht.
Der Kalendereintrag ist das Gegenbeispiel — auch eine Liste, aber nach der Zeit geordnet, und
deshalb „Mara Lentz".

---

## K9 — Kein Abweichen: der Wochentagspunkt war ein Fehlbefund

Kein Eintrag über den Code, sondern über den Abgleich. `docs/design-abgleich/` führt unter D8
„Wochentag mit Punkt („Mi., 26.08.2026") statt „Mi, 12.08.2026"". **Gebaut stand der Punkt
längst**: `formatBerlinDateLong` geht über `Intl` mit `weekday: 'short'`, und das deutsche
Kurzformat hat ihn — nachgemessen am laufenden Bildschirm.

Ohne Punkt gibt es genau eine Stelle, und sie steht woanders: die Titelzeile des Kalenders
(`routes/_app/appointments.tsx`) setzt den Wochentag aus `strings.date.weekdays` selbst
zusammen. Der Abgleich führt sie unter D9 getrennt auf; korrigiert wird sie in K10.

Vierter Fall, in dem Prosa und Wirklichkeit auseinandergingen — diesmal in meiner eigenen
Liste, nicht in der des Handoffs.

---

## K10 — Die Leisteninhalte standen rechts statt links — **zurückgedreht in D-K2**

**Der Eintrag lautete:** Das Design hat eine linke Leiste (238 px) mit „Neuer Termin", darunter
den Minimonat, darunter „Freien Termin finden" — und rechts eine zweite mit dem Tagesüberblick.
Gebaut waren zwei Spalten: alles davon in der **einen rechten** Leiste, in derselben
Reihenfolge. Begründet mit einer D9-Entscheidung („zwei Spalten statt drei") und damit, dass die
Kopfzeile dadurch die des Designs sein konnte.

**Gilt nicht mehr.** Die Bilder der zweiten Runde zeigen drei Spalten, und die Vorgabe steht
über der früheren Entscheidung. Gebaut ist seit D-K2 genau das: links `calendar-sidebar.tsx`
(238 px), in der Mitte das Raster, rechts `calendar-rail.tsx` (320 px) mit dem Tagesüberblick.
Die Kopfzeile bleibt trotzdem die des Designs — die beiden Knöpfe, die sie einst umbrechen
ließen, stehen jetzt links statt rechts, nicht wieder in ihr.

Der Eintrag bleibt als Protokoll stehen, damit die Entscheidung nicht zweimal getroffen wird.

---

## K10 — Kein Abweichen: der Auswahl-Ton war ein Fehlbefund

Der Abgleich führte unter D9 „Kein Auswahl-Ton auf der Spalte des gewählten Tags". Der Prototyp
hat keinen: `spalteBg` tönt allein `heuteIso` (`primary 3 %`), die Kopfzelle `primary 8 %`,
geschlossene Tage `muted 55 %`. Gebaut stand genau das. Nichts zu tun; der Befund war meiner.

*Nachtrag D-K2:* Die Werte sind dieselben geblieben, nur nicht mehr als Tailwind-Alpha
geschrieben, sondern als `color-mix` gegen die Token — `primary 8 %` in der Kopfzelle,
`primary 3 %` in der Spalte, `muted 55 %` außerhalb der Öffnungszeiten. Der Grund ist das
dunkle Thema: eine Deckkraft auf einem hellen Grund ergibt dort einen hellen Fleck, eine
Mischung mit `--card` nicht.
