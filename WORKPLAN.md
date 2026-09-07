# WORKPLAN.md

Slice order for this repository. Read together with `CLAUDE.md`, which holds the architecture, the domain rules and the target data model.

**One slice = one plan + one DDL review + one implementation + one commit.** Do not start a slice before I confirm the plan, and do not continue to the next slice unprompted. Update the status column in this file as part of each slice's commit.

| # | Slice | Status |
|---|---|---|
| 0 | Scaffold | **done** |
| 1 | Tenant, user, login, practice settings | **done** |
| 2 | Contacts and roles | **done** |
| 3 | Services and service groups | **done** |
| 4 | Activities and appointments | **done** |
| 5 | Notes, files, locking | **done** |
| 6 | Invoices: draft, finalize, PDF | **done** |
| 6.5 | Roles and relations | **done** |
| 7 | Cancellation invoices | **done** |
| 7.5 | Activity types and the status split | **done** |
| 8 | Payments and receivables | **done** |
| 9 | Google Calendar sync | **done** |
| 10 | Sending invoices by email | **done** |
| 11 | Deployment via Coolify | **done** |
| 12 | Theme mechanism and user preferences | **done** |

## Design-Umsetzung

Umsetzung des Design-Handoffs aus `docs/design_handoff_praxi_web`. D1 klärt zuerst alle
Schemaänderungen an einer Stelle, damit D2–D9 reine Oberfläche sind.

| # | Paket | Status |
|---|---|---|
| D1 | Modelländerungen | **done** |
| D2 | Querschnittsbausteine | **done** |
| D3 | Navigation | **done** |
| D4 | Einstellungen | **done** |
| D5 | Leistungen | **done** |
| D6 | Kontaktbereich | **done** |
| D7 | Zahlungen | **done** |
| D7.5 | Totes aufräumen | **done** |
| D8 | Vorgänge | **done** |
| D9 | Kalender | **done** |
| D9.5 | Freien Termin finden | **done** |
| D10 | Rich Text für Notizen | **done** |

## Design-Korrektur

Nacharbeit auf Grundlage von `docs/design-abgleich/` — dem Bildvergleich aus Prototyp und
gebauter Oberfläche, Bildschirm für Bildschirm.

**Grundregel, sie ersetzt den Maßstab der D-Pakete: Das Design ist maßgebend.** Es ist über
mehrere Tage entstanden und zu 99 % korrekt. Eine Abweichung wird vorher gefragt und begründet
und nicht selbst entschieden, auch nicht mit Verweis auf eine Repo-Regel. Widerspricht eine
Regel dem Design konkret, kommen beide auf den Tisch. In den D-Paketen galt das Umgekehrte,
und die Abweichung wurde dadurch zur Gewohnheit — genau das korrigiert dieser Abschnitt.

**Eine feststehende Ausnahme:** Die globale Suche in der Kopfzeile bleibt weg, bis sie
tatsächlich gebaut wird. Ein Knopf ohne Funktion ist dasselbe Muster wie der
Briefbogen-Knopf, der 404 antwortete — siehe „Ein Formular behauptet keinen Zustand" in
CLAUDE.md.

Vorab entschieden, jeweils zugunsten des Designs: Statusfilter-Chipzeile und Farblegende im
Kalender entfallen (der Prototyp hat sie nicht) · freie Dauern im Terminfinder 15/30/60 ·
Kontakt-Stammdaten mit Linien innen **und** Kartenrahmen außen · Lesemodus zeigt Werte als
Text, nicht als deaktivierte Felder.

| # | Paket | Status |
|---|---|---|
| K1 | Fundament | **done** |
| K2 | Lesemodus | **done** |
| K3 | Zusammenfassungen | **done** |
| K4 | Einstellungen | **done** |
| K5 | Leistungen | **done** |
| K6 | Kontaktbereich | **done** |
| K7 | Kontakt-Reiter | **done** |
| K8 | Zahlungen | **done** |
| K9 | Vorgänge | **done** |
| K10 | Kalender | **done** |

## K1 — Fundament

Die vier Stellen, die jeden Bildschirm gleichzeitig heben. Überwiegend numerisch, alle Werte
am Prototyp gemessen und nicht aus dem Handoff-README übernommen — das README des Abgleichs
hatte die Inhaltsbreiten falsch, weil sie per `grep` aus den Dateien kamen und `grep` innere
Blöcke mitzählte. Gemessen gilt:

| Bildschirm | Seiten-Container | Kopfabstand | Kappung liegt auf |
|---|---|---|---|
| Einstellungen | 1180 | 22 / unten 48 | Seite selbst |
| Leistungen | 1180 | 22 / unten 40 | Seite selbst |
| Zahlungen | 1180 | 20 / unten 28 | Seite selbst |
| Vorgänge | ungebremst | 22 / unten 14 | nur der Listenbereich, 1180 |
| Kontaktliste | ungebremst | 26 / unten 24 | — |
| Kontaktdetail | ungebremst | 20 / unten 0 | nur der Reiterinhalt, 1100 |
| Kontakt anlegen | ungebremst | 22 / unten 18 | nur die Formularkarte, 1100 |
| Kalender | ungebremst, kein Polster | 0 | — |

- **Polster und Kappung sind zwei Dinge, und nur eines davon gehört in die Hülle.**
  `lib/page-chrome.ts` hält die Polsterklasse je Route-ID, `_app.tsx` liest sie über
  `useMatches`; keine Route setzt eine Zahl. Die Kappung ist `components/content-width.tsx`
  (`ContentWidth`), weil sie auf vier Bildschirmen **innen** sitzt: Vorgänge kappt die Liste,
  aber nicht das Filterband, Kontaktdetail den Reiterinhalt, aber nicht Kopf und Reiterzeile.
  Eine Zahl je Route hätte genau diese vollbreiten Bänder gekostet — und die Trennlinie unter
  dem Filterband wie die durchgehende Reiter-Unterstreichung sind eigene Befunde im Abgleich.
  Entschieden: **1000 und 1100 werden zu 1100 vereinheitlicht**, der Kalender bleibt immer
  vollbreit.
- **`PageHeader` bekommt einen dritten Slot.** H1 26 px / Zeilenhöhe 1.1 / Laufweite −0.022em
  (war 24 / 32 px / −0.025em — die Zeilenhöhe war der sichtbarere Fehler). Neu `note`: 13 px,
  Abstand 10 px. Die **720-px-Kappung liegt auf dem ganzen Textblock**, nicht auf der Notiz
  allein, so wie im Prototyp. Ohne diesen Slot war der Erläuterungssatz auf mehreren
  Bildschirmen in die Karte gewandert und hatte den Knopf mitgenommen; das aufzuräumen ist
  jetzt möglich und gehört in K5 bzw. je Bildschirm.
- **Die Listenkopfzeile lag eine Stufe zu hoch:** 11 px statt 12, Laufweite 0,22 statt 0,3 px,
  Höhe 36 statt 40 px. Der Wert steht als `listHeaderClass` in `list-card.tsx` und wird von
  `ListCardHeaderCell` **und** den drei handgebauten Kopfzeilen gelesen
  (`service-list`, `service-group-list`, `invoice-list`) — vorher hatte jede ihre eigene
  Klassenkette, weshalb eine Korrektur an `list-card.tsx` allein die Rasterlisten nie erreicht
  hätte. Die im Abgleich gemessenen 49 px kamen nicht vom Polster, sondern vom Umbruch von
  „ZIFFER (GEBÜH)" auf zwei Zeilen; das Label kürzt K5.
- **Pfeile statt Chevrons** in `catalogue-controls.tsx`: `ArrowUp`/`ArrowDown`, Knopf 26 × 26
  statt 36 × 36, Icon 14 px, Strichstärke 2 — Muster 6 des Handoffs sagt „Pfeiltasten", und
  der Prototyp zeichnet sie. Wirkt auf alle sieben Katalog-Listen zugleich.

## K5 — Leistungen

Klein, und mit einer Korrektur an der eigenen Vorgabe.

- **Die sieben Rasterspalten stehen nur in der README-Prosa.** Der Prototyp benutzt dasselbe
  fünfspaltige Grid wie der Build und hängt Status (66 px) und die beiden Pfeile (je 26 px)
  daneben in dieselbe Flex-Zeile. Die gebauten Zeilen entsprachen dem exakt; gefehlt haben nur
  diese drei Zellen in der **Kopfzeile**, weshalb „Status" ohne Überschrift stand. Dritte Stelle
  nach K1 und K4, an der Prosa und Markup auseinandergehen — ab hier gilt das Markup.
- **Kopfzeile jetzt 35,5 px**, der offene Punkt aus K1. Sie kam nicht vom Polster, sondern vom
  Umbruch von „ZIFFER (GEBÜH)"; die Spaltenüberschrift heißt jetzt „Ziffer", während Formular
  und Detailfeld die lange Form behalten — so beschriftet der Prototyp die drei Stellen.
- **Erläuterungssatz und Knopf im Seitenkopf** (dritter Slot aus K1). Damit entfällt der
  Titelbalken der Karte, den der Prototyp dort nicht hat, und die Karte beginnt mit der
  Kopfzeile. **Ein** Knopf, dessen Label dem Reiter folgt, wie `neuLabel` im Prototyp; der
  Gruppen-Reiter behält seinen eigenen Satz als 13-px-Zeile über der Karte.
- **Reiter als runde Chips** (`tabChipClass` neben `filterChipClass` in `components/chip.tsx`):
  32 px, Zähler gedämpft dahinter. Eigene Form, weil ein Filter-Chip die Zahl als Aussage trägt
  und ein Reiter sie als Beiwerk zum Namen.
- **Zeilentext 14 px** statt der von `body` geerbten 16, und die Bezeichnung in 600 statt 500.
- Nebenbei zwei Ein-String-für-zwei-Zwecke-Fehler behoben: „Aktiv" ist kein Spaltenkopf (der
  heißt „Status"), und `tabRelations` trug Navigationslabel und Kartentitel zugleich — die
  Bereichsspalte sagt „Beziehungen", die Karte „Beziehungsarten", weil dort Typen gepflegt
  werden.
- **Nachgetragen:** ein Typfehler, den K4 mitcommittet hatte — das Spreaden des nullable
  `recipientSnapshot` im PDF-Test machte jeden Schlüssel optional. In K4 lief die Typprüfung vor
  dem Hinzufügen des Tests, und `vitest` prüft keine Typen.

## K6 — Kontaktbereich

Kontaktliste, Kopf und Stammdaten der Akte, Kontakt anlegen. Nachweis und Messtabelle in
`docs/design-korrektur/k6/`.

- **Filterzeile der Kontaktliste wieder eine Karte und eine Zeile**: Suchfeld mit Lupe ohne
  sichtbares Label, Trennstrich, die Rollenreiter, „Weitere" als Reiter mit Chevron statt eines
  Selects — und rechts, was *wie* angezeigt wird: Archivierte, Aktuell/A–Z, Spalten. Die Reiter
  sind eine dritte Chip-Form (`listTabClass`), weil der Prototyp sie hier ohne Rahmen und mit
  voller Primärfläche zeichnet.
- **Termin-Spalte einzeilig.** Sie zeigte denselben Zeitpunkt zweimal absolut, weil
  `formatRelativeBerlin` jenseits von ±1 Tag bewusst auf ein Datum zurückfällt. Neu daneben:
  `formatBerlinDayTime` („Do., 27.08. · 09:00") und `formatRelativeDayBerlin` („in 6 Tagen"),
  das nie ein Datum nennt — genau deshalb darf es neben einem stehen.
- **Kopf der Akte ist eine vollbreite, klebende Leiste in Kartenfarbe**, mit den Reitern darin.
  Das ist die Voraussetzung für die durchgehende Linie: die 2-px-Unterkante des aktiven Reiters
  sitzt auf der Trennlinie der Leiste. Nr. und Alter stehen in der Namenszeile, die Rollen als
  Badges darunter, „Archivieren" ist ein schlichter Textknopf, „Zurück" ist weg — den Weg zurück
  hat die Seitenleiste.
- **Stammdaten:** Hinweissatz und „Bearbeiten" als Primärknopf über der Karte, Kartenrahmen um
  die Abschnitte, eigener Abschnitt „Person" (Geburtsdatum → Geburtsort → Geschlecht, je 4/12),
  Pflichtstern an Nachname und Firmenname, klebende Fußzeile im Bearbeiten-Modus.
- **Der Rollen-Abschnitt, der ganz gefehlt hat**: Lesemodus Badges plus „Nicht zugeordnet: …",
  Bearbeiten drei feste Spalten. Damit fällt das Stiftsymbol im Kopf weg — zwei Wege zu
  denselben Daten sind einer zu viel. Gespeichert wird in zwei Aufrufen, Stammdaten zuerst;
  scheitert der zweite, sagt der Bildschirm genau das und **bleibt im Bearbeiten-Modus**, damit
  die getippten Haken nicht verloren gehen.
- **`Section` nimmt jetzt ein `variant`** statt `titleWidth`: Titelspalte 180/200, Abstand am
  Trennstrich 22 unten gegen 24 beidseitig, Zeilenabstand 14 gegen 16. Drei Werte, die immer
  gemeinsam auftreten, unter einem Namen.
- **Drei Funde außerhalb der Liste**, alle im k6-Nachweis begründet: `ContentWidth` war auf
  beiden Kontaktbildschirmen 64 px zu schmal (die Kappung sitzt dort *innerhalb* des Polsters,
  anders als auf den vier 1180er-Bildschirmen — jetzt eine Tabelle statt einer Formel); `main`
  war ein Scroll-Container, der nie scrollte, weshalb nichts Klebendes klebte; und der Kalender
  stand seit K1 32 px daneben, weil sein `-m-8` aus D9 stammt, als die Hülle diese Route noch
  polsterte.

## K7 — Kontakt-Reiter

Notizen, Vorgänge, Rechnungen, Übersicht. Nachweis in `docs/design-korrektur/k7/`.

- **Notizen sind eine Liste plus Lesespalte** (`components/note-panel.tsx`, ersetzt
  `note-list.tsx`): links 300 px mit Datum, Schloss, Büroklammer samt Zahl, Art und einzeiliger
  Vorschau, rechts die gewählte Notiz breit gesetzt mit klebender Aktionszeile. Vorher stand jede
  Notiz vollständig aufgeklappt untereinander, sodass ein Jahr Dokumentation eine einzige Spalte
  war. Nachträge sind eigene, eingerückte Zeilen statt Verschachtelungen — sie haben ein eigenes
  Datum, und der Prototyp listet sie so.
- **Die Lesespalte liest, der Dialog schreibt.** Der Prototyp bearbeitet dort in einem
  `contentEditable`; das ist für Notiztext ausdrücklich verboten, weil genau dieser Text gehasht
  und gesperrt wird. Der Prototyp stellt den Dialog selbst daneben — wir bauen seine zweite
  Hälfte. Im Register begründet.
- **Der Notiz-Dialog hat keinen Lesemodus mehr**, und `ReadModeFooter` ist gelöscht: alle drei
  Wege hinein heißen schreiben. Der CLAUDE.md-Satz, der den Mechanismus für alle Dialoge nannte,
  ist durch den Grundsatz ersetzt.
- **K3-Korrektur:** die Chip-Zeilen der drei Reiter **filtern** im Prototyp. K3 hatte das Gegenteil
  notiert, weil ein Klick sichtbar die Auswahl verschiebt — er filtert aber auch. Jetzt echte
  Filter, die Null bleibt stehen, `CountChip` gelöscht.
- **Vorgangszeilen tragen den Terminstatus wieder**, immer und als „Termin Bestätigt" / „Termin
  Kurzfristig abgesagt" (rot). Vorgangsstatus und Abrechnungsstand waren schon da und auf den alten
  Testdaten nur nie erfüllt. Wirkt auf die praxisweite Vorgänge-Seite mit, deren Prototyp dieselbe
  Zeile hat.
- **Rechnungen:** die Karte „Abrechenbar, noch nicht in Rechnung" über der Liste, Zeilen mit
  Leistungsumfang („2 Vorgänge · Juli") und Fälligkeit („fällig 21.08.2026", „bezahlt 04.08.2026"),
  Knopf „Rechnung erstellen" — als eigener String neben dem Dialogtitel „Neue Rechnung", damit sich
  der Fehler aus K4 und K5 nicht wiederholt.
- **Zwei abgeleitete Felder** machen das möglich: `invoiceLine.activityId` (Left Join, weil eine
  freie Position zu keinem Vorgang gehört) und `invoice.lastPaidOn`. Abgeleitet wie `paidCents`,
  keine Migration, je ein Test.
- **Übersicht:** die großen Zahlen des Designs (28 px für Beträge, 19 px für den nächsten Termin)
  und seine Anordnung — drei Karten nebeneinander, darunter Kontakt neben Letzte Vorgänge im
  Verhältnis 1 : 1,35, darunter die Beziehungen über die volle Breite.

## K8 — Zahlungen

Beide Reiter. Nachweis und Messtabelle in `docs/design-korrektur/k8/`.

- **Die beiden Kacheln sind der Reiterumschalter** (`components/payment-tiles.tsx`), 551 × 104,
  je mit Betrag, zwei Infozeilen und — rechts — dem roten „1 Rechnung überfällig". Vorher ein
  Segmentcontrol ohne jede Zahl. Die Frage dieser Seite ist eine Geldfrage; die Kacheln
  beantworten sie vor dem Klick.
- **Eine Statusspalte statt zweier.** „Status" und „Zahlungsstand" mussten zusammen gelesen
  werden — dieselbe Doppelung, die D7 beim Chipband schon aufgelöst hatte und in den Spalten
  stehen ließ. Der Badge kommt aus `invoicePaymentState()`, daneben steht „45,00 € bezahlt" bzw.
  „bezahlt am 04.08.2026".
- **Sechs Chips**, Zahl vorn. „Teilweise bezahlt" entfällt als Chip, weil „Offen" ihn enthält —
  `matchesInvoiceListFilter` nimmt ihn jetzt mit; ein eigener Chip hätte die Summe der Chips über
  die Zahl der Rechnungen getrieben. Der Zustand steht weiterhin als Badge in der Zeile.
- **Zahlenstellung getrennt** (Korrektur an K3): Filter-Chip die Zahl vorn, Reiter die Zahl
  hinten. Zwei Rollen — bei einem Filter ist die Zahl die Aussage, bei einem Reiter eine
  Nebenangabe zum Namen. Umgestellt: Zahlungen und die Vorgänge-Seite.
- **Summenzeile links der Chips** („4 Entwürfe · 3 offen · 575,00 € ausstehend"), Betrag vor
  Offen, Überfälligkeit als „seit 3 Tagen" neben dem Fälligkeitsdatum, Tabellenkopf 14 px in
  gemischter Schreibung.
- **Offene Vorgänge in drei Ebenen**: Kontakt → Vorgang → Position, mit Art-Chip und Summe je
  Vorgang und einem „Rechnung erstellen" in der Gruppenkopfzeile, sobald dort etwas angehakt ist.
  Flach unter dem Kontakt wiederholte eine Sitzung mit drei Positionen dreimal ihr Datum. Die
  klebende Fußzeile bleibt daneben — im Register begründet.
- **Zwei Funde nebenbei:** eine gespeicherte Spaltenauswahl hielt die alte Reihenfolge am Leben
  (wird jetzt verworfen, sobald sie eine Spalte nennt, die es nicht mehr gibt), und „Offen
  insgesamt" unter der Tabelle zählte Entwürfe als offen mit — 995 € Unterschied zur Kachel.

## K9 — Vorgänge

Klein. Nachweis in `docs/design-korrektur/k9/`.

- **Kontaktnamen als „Nachname, Vorname"** in der Vorgangsliste und in beiden Reitern von
  Zahlungen — serverseitig, `formatContactNameSorted` statt `formatContactName` in
  `domain/activity.ts` und `domain/billable.ts`. Die Regel dahinter steht jetzt als Kommentar
  an der Funktion: nicht „Liste oder Fließtext", sondern **ob die Sortierung nach dem Namen
  geht**. Der Kalendereintrag ist das Gegenbeispiel — auch eine Liste, aber nach der Zeit
  geordnet, und deshalb „Mara Lentz".
- **Die Empfängerspalte der Rechnungsliste bleibt natürlich**: sie zeigt den eingefrorenen
  `recipient_snapshot`, also das, was auf dem PDF steht. Eine Liste, die den Empfänger anders
  schreibt als das Dokument, wäre ein Widerspruch, den eine Betriebsprüfung erklärt haben will.
  Im Register.
- **Die Trennlinie unter dem Filterblock** ist der Rand einer vollbreiten, klebenden Leiste in
  Kartenfarbe — dasselbe Muster wie der Kopf der Kontaktakte aus K6. Unter einem gekappten Block
  wäre sie ein Strich in der Mitte des Bildschirms statt einer Teilung.
- **Der Wochentagspunkt war ein Fehlbefund meines Abgleichs.** Gebaut steht er längst, aus
  `Intl` über `formatBerlinDateLong`. Ohne Punkt schreibt allein die Titelzeile des Kalenders,
  die ihn aus `strings.date.weekdays` selbst zusammensetzt — das ist K10.
- **Nachträge aus K8:** die Chip-Zeilen der Kontakt-Reiter bekommen die Zahl nach vorn (sie sind
  seit K7 Filter, damit greift die Regel), und das Verwerfen einer veralteten Spaltenauswahl ist
  kommentiert.

## K10 — Kalender

Der letzte Korrekturdurchgang. Nachweis in `docs/design-korrektur/k10/`.

- **Terminblöcke getönt statt vollflächig**: `color-mix(in oklab, <Artfarbe> 20 %, var(--card))`
  mit 3-px-Strich links in der Artfarbe, angefragte Termine gestrichelt bei 9 %. **Damit fällt
  `readableTextOn` auf dem Block weg**, und zwar weil sie dort falsch liegen muss: sie misst die
  Artfarbe, während die Fläche zu vier Fünfteln die Karte ist — für ein dunkles Violett sagt sie
  „Weiß" auf fast weißem Grund. Die Tönung mit einem Themen-Token macht den Text zu
  `--foreground` und ist in allen fünf Schemata richtig; nachgemessen, Tabelle im Nachweis. Die
  Begründung steht als Kommentar an der Funktion.
- **Statusfilter und Farblegende raus** (Zutaten aus D9), der `status`-Parameter der Route damit
  ebenfalls.
- **„Neuer Termin" und „Freien Termin finden" in die rechte Leiste**, oben der Knopf, darunter
  Minimonat und Finder. Der Prototyp legt sie in eine linke Leiste; wir bleiben bei zwei Spalten
  und spiegeln die Zusammensetzung. Die Kopfzeile ist damit die des Designs und bricht nicht mehr
  um.
- **Formate**: „17. – 21. August 2026 · KW 34", „Mittwoch, 12. August · 2026", Tagesüberblick
  „Mittwoch, 19. August". Zwei neue Formatierer in `packages/shared` mit Tests; die
  Zweibuchstabenliste bleibt für Spaltenköpfe und Datumsauswahl.
- **Kennzahlen „belegt" und „Absagen"** — das Design. Meine Abgleichzeile hatte die
  Pfeilrichtung verkehrt und war so in die Anweisung gelaufen; im Register vermerkt.
- **Überblickstag** nach der Regel des Prototyps: gewählter Tag, sonst heute, sonst erster Tag
  des Zeitraums. Vorher stand dort ein Tag, der nach einem Wochenwechsel nicht mehr sichtbar war.
- **Karte „Nächste freie Zeit"** mit „Termin dort anlegen", die den Server fragt statt selbst zu
  rechnen. Freie Dauern 15/30/60.
- **Fehlbefund:** „Kein Auswahl-Ton auf der Spalte des gewählten Tags" — der Prototyp tönt allein
  heute, und das war gebaut. Nichts zu tun.

## K4 — Einstellungen

Das größte Korrekturpaket, und das erste mit einer Migration: `0033_practice_vat_id`.

- **Praxis ist eine Karte mit sechs Abschnitten**, nicht fünf gleichrangige Karten. Das Raster
  liegt in `components/section-grid.tsx` und wird von der Kontaktakte mitbenutzt — die hatte
  eine eigene Kopie, und zwei Umsetzungen desselben Rasters wären genau die Drift, die K1 bei
  der Listenkopfzeile aufgeräumt hat. **Die Titelspalte ist 180 px in den Einstellungen und
  200 px in der Akte**; beides steht so im Prototyp, deshalb ist die Breite ein Prop. Die Akte
  ist dabei von einem 6- auf das 12-Spalten-Raster des Designs umgestellt — dieselben Breiten,
  aber in den Begriffen, die das Design benutzt.
- **Der Abgleich hatte hier zwei Fehler, beide meine.** Der aktive Bereichseintrag war kein
  Befund: der Prototyp setzt `color-mix(in oklab, var(--primary) 10%, var(--card))`, also genau
  `bg-primary/10`, das der Build schon hatte — es wirkt neutralgrau, weil `--primary` mit
  Chroma 0.028 blass ist. Geblieben ist, dass Tailwind gegen die Seite statt gegen `--card`
  mischt; das ist jetzt exakt. Und die Titelspalte ist 180 px, nicht die 200 aus dem README.
- **`practice_settings.vat_id`** (Migration 0033), gespiegelt an `contact.vat_id`: nullable,
  ohne Default und ohne Check, die Länge steckt in Zod. D4 hatte die Spalte zurückgestellt; das
  Design zeigt das Feld im Abschnitt „Steuern".
- **Das Zahlungsziel steht wieder in der Praxis-Karte**, als sechster Abschnitt, und ist aus
  „Rechnungsstellung" verschwunden. Gefahrlos seit D4: die Route ist ein `PATCH` und jedes
  Formular sendet nur, was es zeigt — die damalige Race Condition kann nicht wiederkehren.
- **Ein Land ist nie ein ISO-Code auf dem Bildschirm.** `packages/shared/src/country.ts` hält
  die acht Länder des Designs und `countryName`; Praxis und Kontaktakte bieten ein Auswahlfeld,
  der Lesemodus zeigt den Namen. **Das PDF war die eigentliche Fundstelle**: sein Adressblock
  druckte den rohen Code für Empfänger außerhalb Deutschlands, was in einem Brief so falsch ist
  wie auf dem Schirm — und ein festgeschriebenes Dokument lässt sich nie korrigieren. Für
  Deutschland wird gar keine Landeszeile gedruckt, weshalb es unbemerkt blieb. Der Test dafür
  vergleicht `AT` gegen das ausgeschriebene `Österreich`: gleiche Bytes heißt, der Name wird
  gedruckt, ohne dass Text aus dem PDF gelesen werden muss.
- **Nummernkreise sind eine Tabelle** mit `KREIS · PRÄFIX · STELLEN · NÄCHSTE NUMMER ·
  VORSCHAU` — aber mit Lesemodus je Zeile, gegen das Design und mit Eintrag im Register: ein
  Vertippen in „nächste Nummer" vergibt eine schon gedruckte Rechnungsnummer erneut. Der
  ehrliche Zustand bleibt: leere Werte `—`, und die Vorschau `—`, solange die drei Werte nicht
  zusammen gültig sind.
- **Vorgangsarten:** Farbpunkt statt Farbklotz mit drei Buchstaben (`readableTextOn` fiel dort
  weg, weil nichts mehr auf der Farbe steht), und die Zeile sagt wieder, was das Anwenden täte —
  „60 Minuten · Erstgespräch mit Anamnese", bei fehlender Dauer „ohne übliche Dauer" und nicht
  `—`, weil das eine Aussage ist und keine Lücke.
- **Beziehungen** erklären die Richtung in Worten — „Gegenstück: Kind von", „Gilt in beide
  Richtungen gleich", „Höchstens einmal pro Kontakt" —, nicht als `A ↔ B`.
- **Mailkonto und Google** tragen „Bearbeiten" bzw. die Verbunden-Marke im Kartenkopf.
  Googles Statusstreifen steht wieder oben, mit **allen drei** Feldern: `LETZTER FEHLER` fehlte
  im fehlerfreien Zustand ganz, was nach Regel 13 falsch herum ist — ein Feld, das bei gutem
  Zustand verschwindet, kann „nichts ist passiert" nicht sagen. Die Zeit ist relativ.
- **Die Bereichsspalte** benutzt die kurzen Navigationstexte des Prototyps. D4 hatte einen
  String für Navigation und Kartenkopf benutzt; im Design sind es zwei, und deshalb brachen
  drei Einträge auf drei Zeilen um.

## K3 — Zusammenfassungen

Der Befund, der sich am häufigsten wiederholte: über acht Listen fehlte die Zählzeile, und in
den Einstellungen war dieselbe Bewegung in beide Richtungen passiert — der erklärende
Schlusssatz war weg, eine Spaltenkopfzeile war dazugekommen.

- **Alle Zahlen lagen schon im Browser.** Keine einzige zusätzliche Abfrage: die drei
  Kontakt-Reiter laden ihre Liste in `contacts.$contactId.tsx` selbst, `invoice-list.tsx`
  rechnet `invoicePaymentState()` je Zeile ohnehin, und `services.tsx` liest für die
  Reiter-Zähler dieselben Query-Keys, die die beiden Listen darin schon geholt haben — ein
  Cache-Treffer. Nachgesehen wurde vorher, nicht hinterher.
- **Zahl hinter dem Wort, überall** (`components/chip.tsx`). Der Prototyp macht es auf den
  Leistungen-Reitern so und auf allen anderen Chips umgekehrt; vereinheitlicht per
  Entscheidung, festgehalten in `docs/design-korrektur/abweichungen.md`. Die Prosa-Zeile
  daneben bleibt Prosa.
- **Die Zähl-Chips filtern nicht, also sind sie keine Knöpfe.** Am Prototyp geprüft: ein Klick
  verschiebt nur die Auswahl. Im Prototyp sind es trotzdem `<button>` — gebaut ist `<span>`,
  weil ein Bedienelement ohne Funktion dasselbe Muster ist wie der Briefbogen-Knopf mit 404.
  Deshalb entfällt auch ein Chip mit `0`: bei einem Filter wäre die Null eine Aussage, bei
  einer Zählung ist sie Rauschen. Die **Filter**-Chips (Zahlungen, Vorgänge) behalten ihre
  Nullen.
- **Der aktive Chip ist ein heller Primary-Ton mit Primary-Rahmen**, nicht die dunkle Füllung
  von `Button variant="default"`: in einer Reihe von sieben liest eine gefüllte Pille als
  Hauptaktion des Bildschirms und nicht als „diese ist gewählt". Mitgenommen, weil K3 jede
  Chip-Zeile ohnehin anfasst.
- **Fünf Spaltenkopfzeilen entfernt, nicht vier** — zu Rollen, Beziehungen, Vorgangsarten und
  Mailvorlagen kam **Textbausteine**, das im Abgleich durchgerutscht war. Damit hatten
  `ListCardHeaderRow` und `ListCardHeaderCell` keine Aufrufer mehr und sind gelöscht;
  `listHeaderClass` bleibt, und `invoice-list.tsx` zeigt, wie eine Kopfzeile ohne die beiden
  aussieht.
- **Die drei Schlusssätze** stehen wieder unter ihrer Karte, im Wortlaut des Prototyps.
- **Aus dem Sweep über alle neun Prototypen** kam eine Zeile hinzu, die nicht auf der Liste
  stand: die Fußzeile der Kontaktliste nennt jetzt die Seitengröße („45 von 214 angezeigt ·
  Seitengröße 50"), und zwar weiter nur dann, wenn die Liste wirklich gekürzt ist. Ebenfalls
  gefunden und **nicht** hier behoben: **Zahlungen → Offene Vorgänge hat gar keine Zählzeile**,
  dort zählt die Kachel (K8); die Kartenzahlen der Kontakt-Übersicht sind K7; die
  Kalender-Kennzahlen K10. Die praxisweite Vorgänge-Seite hatte Zähler und Summenzeile schon
  richtig.

## K2 — Lesemodus als Text

Sieben Formulare, ein Baustein, eine gelöschte Komponente. Der Lesemodus rendert kein Feld
mehr: Label, darunter der Wert als Text, fehlende Werte als `—` wie in jeder Liste
(`components/read-value.tsx`).

- **Warum überhaupt.** Die Regel sagt, dass Lesen den Datensatz nicht ändern können darf —
  nicht, dass ein Wert wie ein Eingabefeld aussehen muss. Der Code hatte beides verwechselt und
  die Felder deaktiviert gerendert; eine wenig gefüllte Akte war dadurch eine Wand aus leeren
  Rahmen. Das Handoff sagt es für den Rollen-Abschnitt ausdrücklich („keine deaktivierten
  Checkboxen im Lesemodus, die waren unlesbar"), und für ein Textfeld gilt dasselbe. CLAUDE.md
  ist entsprechend präzisiert.
- **Betroffen waren genau die sieben Formulare mit `disabled={!editing}`:** PracticeForm,
  Kontaktakte, Mailkonto, Nummernkreis und Zahlungsziel, Öffnungszeiten, Notiz-Dialog. Die
  Inline-Details der Kataloge lasen schon vorher über `DetailField` als Text und blieben
  unberührt. `activity-form.tsx` übergab `disabled={false}` — es war nie ein
  Lesemodus-Formular, die Leseansicht ist `ActivityDetail`.
- **Kein Kontrollkästchen war betroffen.** Die Rollen-Checkboxen rendern nur unter
  `{creating && …}`, also ausschließlich auf `contacts/new`, wo immer bearbeitet wird. Der
  fehlende Rollen-Abschnitt der Akte bleibt K6.
- **Die lesbare Bezeichnung eines Auswahlfelds lebt nur in seiner Optionsliste**, und das war
  die eigentliche Fallgrube: ohne Zuordnung hätte der Lesemodus `person`, `male`, `starttls`
  gezeigt. Fünf Stellen mit vorhandener Quelle; die sechste, die Vorgangs-Auswahl im
  Notiz-Dialog, setzt ihr Label zur Laufzeit zusammen und hätte sonst eine UUID gedruckt —
  `selectedActivityLabel` komponiert es identisch.
- **Ein latenter Fehler fiel mit.** `onCancel` der Kontaktakte setzt das Formular nicht zurück,
  der alte Lesemodus zeigte nach „Abbrechen" also die verworfenen Änderungen weiter an, weil er
  aus dem Formular las. `readValue` kommt aus dem geladenen Datensatz.
- **`ReadModeFieldset` ist gelöscht**, samt `useReadOnly`; `ui/select.tsx` ist wieder
  unverändertes shadcn. Nach der Umstellung hätte die Komponente nie mehr `disabled={true}`
  bekommen (Konvention über toten Code). Die Radix-Erkenntnis dahinter steht jetzt in
  CLAUDE.md: `pointerdown` wird auch an deaktivierte Controls geliefert, ein
  `<fieldset disabled>` fängt nur den Klick — wer je ein Formular *sichtbar, aber unbedienbar*
  braucht, läuft ohne diesen Satz erneut hinein.
- Öffnungszeiten lesen als eine Spanne („08:00–12:00") statt als zwei deaktivierte Zeitfelder
  mit Gedankenstrich dazwischen.
- Nachweis in `docs/design-korrektur/k2/`, Lese- **und** Bearbeitungsmodus je Bildschirm.
  Neu ist außerdem `docs/design-korrektur/abweichungen.md` — das Register für bewusste
  Abweichungen, erster Eintrag die 24-px-H1 der Kontaktliste aus K1.

## D10 — Rich Text für Notizen

Keine Migration. `note.text` bleibt `text`, das Format ist eine Konvention über dem String.

- **Fünf Konstrukte, abschließend:** `## Überschrift`, `- Aufzählung`, `1. Nummerierung`,
  `**fett**`, alles andere Absatz. Kursiv fiel weg — zwei Betonungsstufen heißen jedes Mal
  entscheiden, welche, und Kursiv hat in einer Akte keine verabredete Bedeutung. Links,
  Tabellen, Zitate, Code, Bilder ebenfalls nicht; ein Bild gehört als `note_file` an die Notiz,
  wo es die Sperrsemantik erbt.
- **Eine bewusste Abweichung von CommonMark:** ein einzelner Zeilenumbruch bleibt einer.
  CommonMark zöge ihn zu einem Leerzeichen zusammen — drei Namen untereinander gehören aber
  untereinander. Steht als Begründung am Parser.
- **Der Renderer erzeugt kein HTML.** `parseNoteText` liefert einen Baum, `note-text.tsx` bildet
  ihn auf React-Elemente ab. Es gibt keinen String, der zu Markup überredet werden könnte, also
  nichts zu desinfizieren und kein `dangerouslySetInnerHTML` — die Fehlerklasse existiert nicht,
  statt abgewehrt zu werden.
- **Textarea statt ProseMirror**, und das ist die Hash-Entscheidung: ProseMirror hält ein
  Dokumentmodell, also normalisiert Laden-und-Speichern den Text, ohne dass jemand getippt hat.
  Bei einer Notiz, die anschließend gesperrt wird, wäre der gehashte nicht der getippte Text.
  Die Unterscheidung (hinein idempotent = harmlos, heraus = gefährlich) steht an `canonicalNote`.
- **Die Werkzeugleiste benutzt `document.execCommand('insertText')`** — als einzige Ausnahme vom
  Verbot, das jetzt in CLAUDE.md präzisiert ist: verboten ist execCommand für *Formatierung* im
  contentEditable, nicht das Einfügen von reinem Text in ein textarea. Gemessen in Chrome 151:
  ein React-Zustandsupdate, `el.value =` und `setRangeText` **leeren** den Undo-Stapel, statt
  ihn nur nicht zu ergänzen — drei getippte Absätze wären nach einem Klick verloren.
- **Vorschau als Umschalter**, nicht als zweite Spalte: beide Orte, an denen eine Notiz
  geschrieben wird, sind schmal. Im Lesemodus zeigt das Feld gar keine Textarea, sondern die
  gerenderte Notiz.
- `activity.internalNote` bleibt bewusst einfacher Text — anderes Feld, andere Semantik, nie
  gedruckt, nie gesperrt.
- 40 Parser-Tests in `packages/shared`, darunter die zwei Eigenschaften: **total** (20 000
  Zeichen, `\r\n`, eine Wand aus Sternchen, leer) und **Unbekanntes bleibt wörtlich**.

## D1 — Modelländerungen

Schema, Domäne, Routen und Schemas in `packages/shared` für vier Änderungen, damit D2–D9
darauf aufsetzen können. Keine Oberfläche außer dem kleinstmöglichen Eingriff, wo bestehende
Screens sonst nicht mehr kompiliert hätten.

- **Vorbelegung von `activity_type` wird eine Liste.** `default_service_id` und
  `default_service_group_id` entfallen samt Check; neue Tabelle
  `activity_type_preset_item` (service_id, quantity, position) — reine Referenzen, nie Preis
  oder Bezeichnung. Eine Leistungsgruppe wird beim Auswählen in den Einstellungen sofort
  aufgelöst, wie überall (Regel 5); nichts außerhalb des Katalogs referenziert danach noch
  eine Gruppe.
- **Diagnose:** `contact.diagnosis` und `invoice.diagnosis`, beide frei, optional.
  `domain/contact.ts` führt zwei getrennte Spaltenmengen (`listColumns` /
  `detailColumns`), damit die Diagnose die Kontaktliste strukturell nicht erreichen kann
  (Regel 12). Der Rechnungsentwurf wird einmalig aus den Stammdaten vorbelegt
  (`insertDraft`) und bleibt frei überschreibbar. `protect_finalized_invoice` vergleicht seit
  dieser Migration die ganze Zeile minus der erlaubten Spalten statt eine Liste geschützter
  Spalten zu pflegen — eine neue Spalte ist automatisch eingefroren.
- **Reihenfolge:** `sort_order` auf `service`, `service_group`, `text_template` und
  `email_template` — die drei anderen Kataloge (Rollen, Beziehungen, Vorgangsarten) hatten es
  bereits.
- **Leistungen löschbar**, wenn nirgends verwendet: `deleteService`/`deleteServiceGroup` mit
  Domänenprüfung vor dem Fremdschlüssel, für eine lesbare Meldung. `active` bleibt daneben
  bestehen für "nicht mehr zur Auswahl, aber in Gebrauch".

## D2 — Querschnittsbausteine

Sechs Bausteine, isoliert gebaut, ohne bestehende Screens umzustellen — das folgt in
D4/D5/D7, wenn die jeweiligen Screens ohnehin angefasst werden.

- **Listenkarte:** `components/list-card.tsx` — `ListCard`, `ListCardHeaderRow`,
  `ListCardHeaderCell`, `DASH` ("—" für fehlende Werte). Richtigstellung zum
  Design-Handoff-README: das dort behauptete "Klebe-Verhalten bereits in `table.tsx`
  vorhanden" stimmt nicht — `table.tsx` ist die reine shadcn-Primitive ohne Sticky-Header;
  die Optik entsteht neu in `ListCard`.
- **Status als Punkt + Wort:** `ActiveStatus` in `components/catalogue-controls.tsx`, neben
  dem bereits vorhandenen `OrderButtons`. Ausdrücklich nur für Aktiv/Inaktiv — `PaymentStatusBadge`
  bleibt unangetastet. `strings.catalogue` neu, damit "Aktiv"/"Nach oben" nicht mehr unter
  jeder Entität einzeln steht (auch `OrderButtons` liest jetzt von dort statt von
  `strings.contactType`).
- **Reihenfolge:** `domain/reorder.ts` (`moveInList`) — generisch über zwei Callbacks
  (`list`, `setSortOrder`) statt über die Drizzle-Tabelle selbst, tauscht mit dem Nachbarn und
  nummeriert die ganze Liste in einer Transaktion lückenlos ab 0 neu. Für alle sieben Kataloge
  verdrahtet: `moveRoleType`/`moveRelationType` (`domain/contact-type.ts`), `moveActivityType`,
  `moveService`/`moveServiceGroup`, `moveTextTemplate` (bleibt innerhalb seiner `kind`),
  `moveEmailTemplate` — je ein `POST .../:id/move` (Body `{delta}`, Schema `moveInputSchema`
  aus `packages/shared`) und eine Client-Funktion in `lib/*.ts`. Rand der Liste (der Button
  sollte da schon deaktiviert sein) beantwortet die Route mit 204, ein `false`-Aufruf mit
  unbekannter id wirft `MoveTargetNotFoundError` und wird zu 404 — nachträglich getrennt,
  ein unbemerkter Tippfehler in der id sollte kein stiller 204 sein.
- **Inline-Detail:** `components/inline-detail-row.tsx` — `useInlineDetail()` (welche Zeile
  offen ist, Lese-/Bearbeitungsmodus) und `InlineDetailRow` (die aufklappende Zeile selbst).
  Der Bearbeitungsmodus-Fußzeile bleibt bewusst Sache der aufrufenden Stelle, wie schon bei
  `ReadModeFooter`.
- **Spaltenauswahl und -reihenfolge:** `components/column-picker.tsx` — kontrolliert, kennt
  `app_user.preferences` nicht. Reihenfolge per `OrderButtons`, nicht per Drag & Drop (der
  Prototyp wich von seiner eigenen Regel 6 ab). Konvention für den Preference-Schlüssel als
  Kommentar an `userPreferencesSchema` festgehalten: ein flacher Schlüssel je Liste
  (`contactListColumns`, `invoiceListColumns`, …), nie verschachtelt — der Merge in
  `updateUserPreferences` ist ein flaches `jsonb || jsonb`. Wird erst befüllt, wenn D6/D7 die
  erste konkrete Liste umstellen.
- **Spaltensortierung:** kein neuer Zustand — existiert in der Kontaktliste bereits über
  Route-Suchparameter. `components/sortable-column-header.tsx` zieht nur die Kopfzeile
  (Pfeil-Icon, Klick) aus `contacts.index.tsx` heraus, damit sie nicht in jeder Liste neu
  entsteht.

Nebenbei: `components/ui/checkbox.tsx` zeigt bei `checked="indeterminate"` jetzt einen Strich
statt des Hakens (für D7s "Alle auswählen"-Kopfzeile).

## D3 — Navigation

Seitenleiste und Kopfzeile neu aus `_app.tsx` herausgezogen, dazu zwei neue
Präferenzen und eine Konsolidierung in der Navigation.

- **Seitenleiste:** `components/app-sidebar.tsx`. 234 px offen / 62 px eingeklappt, Kopf
  "Praxi" (`strings.app.shortTitle`) über dem Praxisnamen (`practiceSettingsQueryOptions`,
  neu in `_app.tsx`s `beforeLoad` vorab geladen). Die sieben Einträge liegen jetzt in
  `lib/navigation.ts`, gemeinsam mit der Kopfzeile gelesen statt zweimal gepflegt.
  "Termine" heißt jetzt "Kalender" (`strings.nav.appointments`), nur das Navigationslabel —
  die Seite selbst behält ihre eigene Überschrift. Ein-/Ausklappen schreibt `sidebarCollapsed`
  in `preferences`, optimistisch per `setQueryData` in `onMutate`.
- **Kopfzeile:** `components/app-topbar.tsx`. Breadcrumb links zeigt nur das aktive
  Navigationslabel aus derselben Liste — bewusst kein zweites Segment für eine Unterseite,
  dafür gibt es noch keine Datenquelle. Rechts `components/account-menu.tsx`: ein
  `DropdownMenu` (neu, `components/ui/dropdown-menu.tsx` — Popover ist im Repo für freien
  Inhalt reserviert, nicht für ein Menü mit Tastaturnavigation) mit Initialen-Avatar, Name,
  "Einstellungen" und "Abmelden" (die `signOutMutation` ist aus der Seitenleiste hierher
  gewandert). Der Konto-Dialog ist ein `Dialog`, nicht das `AlertDialog` des Prototyps —
  `AlertDialog` ist im Repo durchgehend Bestätigungen vorbehalten, ein Einstellungsformular
  ist keine.
- **Präferenzen wenden sofort an**, wie `ThemePicker` es schon vor D3 tat — kein
  Speichern/Abbrechen, im Unterschied zum gepufferten Prototyp. `ThemePicker` ist nur
  umgezogen (aus dem Fuß der Seitenleiste in den Dialog); neu `components/start-page-picker.tsx`
  nach demselben Muster. Weil die Wirkung von `startPage` anders als beim Farbschema nicht
  sofort sichtbar ist, sondern erst beim nächsten Anmelden, bestätigt eine Toast-Meldung das
  Speichern. Die Checkbox "Navigation eingeklappt starten" aus dem Prototyp entfällt
  ersatzlos — der Knopf in der Leiste ist die eine Wahrheit.
- **Neue Präferenzen** in `packages/shared/src/user-preferences.ts`: `startPage`
  (`startPageOptions` — `overview`/`contacts`/`calendar`/`activities`, englische Bezeichner,
  im Unterschied zum deutschen `themeOptions`, siehe "Before going live") und
  `sidebarCollapsed` (boolean). `login.tsx` schlägt nach dem Anmelden `search.redirect` nach
  wie bisher, sonst `startPagePath(preferences.startPage)` aus `lib/navigation.ts`.
- **"Übersicht" (`/`):** der bisherige Health-Check (Knopf, Serverzeit) war Gerüst aus
  Slice 0 und ist entfernt, nicht ersetzt — die Seite nutzt jetzt die bereits vorhandene,
  bis dahin ungenutzte `PlaceholderPage` mit dem neuen `strings.placeholder.empty` ("Hier
  gibt es aktuell nichts zu sehen") statt des irreführenden `comingSoon`-Texts, den dieselbe
  Komponente vorher trug. `strings.status.serverReachable/serverUnreachable/serverTime` und
  `strings.actions.recheck` sind mit dem Health-Check gelöscht, `/api/health` selbst bleibt.
- **"Zahlungen":** neu `routes/_app/payments.tsx`, derselbe leere Zustand. `billable.tsx`,
  `invoices.index.tsx` und `receivables.tsx` verlieren nur ihren Navigationseintrag und
  bleiben sonst unverändert liegen — siehe die Notiz unter D7 oben für die Begründung und
  wann sie gelöscht werden.

## D4 — Einstellungen

Der größte Listenbereich, und der erste Screen, der die D2-Bausteine tatsächlich verdrahtet.
`routes/_app/settings.tsx` ist jetzt eine Hülle: Bereichsspalte links (`section` als
URL-Suchparameter, Default `practice` — wichtig für den Rücksprung nach der
Google-Anmeldung), rechts eine von acht Karten.

- **Die Race Condition beim Aufteilen von `practice_settings` in zwei Formulare.** "Praxis"
  und "Rechnungsstellung" (dahin zieht das Zahlungsziel um) sind jetzt unabhängig
  bearbeitbare Formulare auf derselben Zeile. Ein `PUT` mit dem ganzen Objekt hätte das eine
  Formular die Änderungen des anderen überschreiben lassen, sobald beide offen sind und
  nacheinander gespeichert wird. Die Route ist jetzt `PATCH /api/settings`, und jedes
  Formular schickt nur die Felder, die es selbst zeigt. Eine `.partial()`-Variante des
  bestehenden Schemas hätte das NICHT gelöst — Zod wendet ein Feld-`.default()` unabhängig
  von `.optional()` an, sobald der Schlüssel fehlt, also hätte ein Patch mit nur dem
  Zahlungsziel `country` und alle anderen Defaults still zurückgesetzt. `field.ts` bekam
  dafür `optionalTextPatch()` (dieselbe Transformation ohne `.default(null)`),
  `practice-settings.ts` ein eigenes `practiceSettingsPatchSchema`, `updatePracticeSettings`
  einen dokumentierten Vertrag ("nur die gesendeten Spalten"), und drei neue Tests — je einer
  in `packages/shared` (Schema-Ebene) und in `apps/server` (Domänen-Ebene) — die genau diesen
  Fall zusichern.
- **Rollen, Beziehungen, Vorgangsarten, Textbausteine, Mailvorlagen:** Dialog raus, Inline-Detail
  rein (`InlineDetailRow`/`useInlineDetail`), die Zwei-`PUT`-Reihenfolge raus, `/move` (D2)
  rein — auch bei Textbausteinen und Mailvorlagen, die der Prototyp ohne Pfeile zeigt: eine
  Liste ohne Pfeile wäre die einzige Ausnahme gewesen. Jede Statusanzeige ist nachträglich auf
  `ActiveStatus` (Punkt statt Badge) umgestellt — das war beim ursprünglichen Bau der
  Dialog-Versionen übersehen worden.
- **Beziehungsarten:** die Checkbox "Einseitig" aus dem Prototyp (invertiert zu
  `isSymmetric`, missverständlich) wird durch zwei benannte `RadioGroup`-Optionen mit
  Beispieltext ersetzt — "Gegenseitig" und "Gerichtet". Neues Primitiv
  `components/ui/radio-group.tsx`. Im Code bleibt `isSymmetric`, nichts ist invertiert.
- **Vorgangsarten:** die Vorbelegung (seit D1 eine Liste) bekommt ihren echten Editor —
  Leistung oder Leistungsgruppe hinzufügen (eine Gruppe löst sich beim Hinzufügen sofort auf,
  Regel 5), Menge, Reihenfolge über die D2-Pfeile, Entfernen. Die Menge ist eine notwendige
  Abweichung vom Prototyp, der `leistungswahl()` ohne Mengenfeld zeigt — die echte Tabelle
  (`activity_type_preset_item.quantity`) braucht sie.
- **Mailkonto** heißt jetzt so (Singular), statt sich den Bereichstitel "Mailversand" zu
  teilen. Passwortfeld: Platzhalter "unverändert lassen" beim Bearbeiten, Punkte im
  Lesemodus statt eines leeren Felds.
- **Mailvorlagen:** "Platzhalter verwenden"-Hinweis mit Link "Platzhalter ansehen", öffnet
  einen `AlertDialog` mit `strings.mail.placeholderList`. Bewusst eine eigene, andere Liste
  als die (nicht gebauten) Nummernkreis-Präfix-Platzhalter — geteilt hätten sie sich keine
  Variable dürfen, das README warnt selbst davor.
- **Nicht gebaut, wie besprochen:** Präfix-Platzhalter-Chips (YYYY/MM/Q) unter dem
  Nummernkreis-Feld — eigenes, zurückgestelltes Paket, berührt die Nummernvergabe. Eine
  Umsatzsteuer-ID für die Praxis — siehe "Before going live".
- **Neuer Baustein:** `components/list-card.tsx` bekommt `ListCardTitleBar` (Titel, Hinweis,
  rechtsbündige Aktion) — der Kartenkopf, den jede der fünf Katalogliste im Format
  "Titel · Hinweis · Neu-Knopf" braucht, statt fünf Kopien derselben `flex`-Zeile.
  `catalogue-controls.tsx` bekommt `DetailField` (Label über Wert), das jedes Inline-Detail
  für seine gelesenen Felder verwendet.
- `contact-type-settings.tsx` exportiert jetzt `RoleTypeSettings`/`RelationTypeSettings`
  einzeln statt einer `Tabs`-kombinierten `ContactTypeSettings` — zwei Bereiche in der neuen
  Spalte, nicht zwei Reiter auf einer Seite. `invoice-settings.tsx` verliert seine
  Textbausteine an das neue `text-template-settings.tsx`; "Rechnungsstellung" ist jetzt
  Nummernkreise, Zahlungsziel und Rechnungsvorlage.

## D5 — Leistungen

Kleiner als D4, dieselben Bausteine — mit einer Ausnahme.

- **Grid statt `<Table>`.** Die Kopf- und Zeilenraster in `service-list.tsx` und
  `service-group-list.tsx` (58/1fr/48/76/80 px bzw. 150/1fr/96/84 px) sind ein CSS-Grid mit
  einer `1fr`-Spalte dazwischen — ein HTML-Table gibt das nicht her. Beide Dateien tragen
  dafür einen Kommentar am Kopf, warum sie bewusst kein `ListCard`-`<Table>` verwenden.
  **Aufgespalten werden musste dafür nichts:** `ListCard`, `ListCardTitleBar`,
  `ActiveStatus`, `OrderButtons`, `DeleteButton`, `DetailField` und `CheckboxField` sind
  bereits markup-neutrale Bausteine (Divs/Spans/Buttons) und funktionieren unverändert in
  einem Grid wie in einer Tabelle. Nur `InlineDetailRow` selbst (an `<TableRow>`/`<TableCell>`
  gebunden) kommt hier nicht zum Einsatz — `useInlineDetail()`, die reine Zustandslogik
  dahinter, schon; das aufklappende Detail ist ein einfaches `div` in derselben Optik. Bleibt
  bei dieser einen Ausnahme, keine zweite Variante der D2-Bausteine nötig.
- **`serviceIsInUse` heißt jetzt `serviceUsage` und sagt, wo.** Bisher ein bloßes
  `boolean` — die Meldung konnte nur "wird verwendet" sagen, nicht wo. Jetzt ein
  `{ activity, group, preset }`, `ServiceInUseError` trägt es, und
  `messages.service.inUse(usage)` baut daraus einen Satz, der alle zutreffenden Gründe nennt
  ("in Vorgängen", "in einer Leistungsgruppe", "als Vorbelegung einer Vorgangsart"),
  kombiniert wo mehr als einer zutrifft. Vier neue Domänen-Tests, je einer pro Grund und
  einer für die Kombination — vorher war nur der Gruppen-Fall abgedeckt.
- **Löschen bleibt reaktiv**, wie in D4: der Knopf ist immer da, der Versuch schlägt fehl,
  die — jetzt spezifische — Meldung kommt als Toast. Bewusst nicht die im Prototyp gezeigte
  vorab gesperrte Variante, die vor dem Öffnen einer Zeile schon wüsste, ob sie löschbar ist —
  das bräuchte eine eigene Abfrage pro Zeile. `deleteService`/`deleteServiceGroup` sind neu in
  `lib/services.ts`; die Routen dafür gab es seit D1, nur noch keine Oberfläche.
- **Reihenfolge geprüft, wo sie greift:** `listServices`/`listServiceGroups` sortieren
  serverseitig nach `sortOrder`, das ist die einzige Quelle. `activity-dialog.tsx` und D4s
  Vorbelegungs-Editor rendern die Antwort unverändert, ohne eigene Sortierung — beide
  übernehmen die Reihenfolge also schon richtig. Der Rechnungseditor bietet den Katalog
  nirgends direkt an (eine Position kommt aus einem Vorgangsposten oder wird frei getippt),
  dort gibt es nichts zu prüfen.
- **`service-dialog.tsx`/`service-group-dialog.tsx`** sind umbenannt zu
  **`service-list.tsx`**/**`service-group-list.tsx`** (`ServiceList`/`ServiceGroupList`) —
  kein Dialog mehr. `services.tsx` verliert den "Inaktive anzeigen"-Filter und den
  Anlegen-Knopf im `PageHeader`; jede Liste bringt ihren eigenen "Neu"-Knopf in der
  `ListCardTitleBar` mit, wie in D4.
- Anlegen einheitlich als Bereich über der Liste, für Leistungen wie für Gruppen — der
  Prototyp macht es an den beiden Stellen unterschiedlich (Leistung: eigener Kasten
  oberhalb; Gruppe: sofort aufgeklappte Zeile), das wird hier vereinheitlicht.

## D6 — Kontaktbereich

Weniger Neubau als D4/D5 — Liste, Akte und "Kontakt anlegen" (schon ein eigener Screen,
kein Dialog) bestanden inhaltlich schon; D6 verdrahtet D2-Bausteine und bringt das
Abschnittsraster.

- **Kontaktliste:** `ColumnPicker` (D2) verdrahtet — Nr., Name (`locked`), Rollen, Ort,
  Geburtsdatum, gespeichert als `contactListColumns` in `preferences`. Die Terminspalte
  ist bewusst nicht Teil der Auswahl: ihre Sichtbarkeit folgt schon der Aktuell/A–Z-Ansicht
  (`showAppointment`), eine zweite Steuerung über die Spaltenauswahl hätte nicht mehr
  erkennen lassen, welcher der beiden Mechanismen gerade entscheidet — der Kommentar an
  `contactColumns` in `contacts.index.tsx` hält das fest. `SortableColumnHeader` (D2)
  ersetzt den inline `sortHeader()`-Closure, der in D2 aus genau dieser Datei gezogen, aber
  nie hier eingesetzt wurde. Sortierung bleibt inhaltlich in der URL. Reiterzeile und
  Aktuell/A–Z-Umschalter bekommen die abgerundete Optik, keine Zähler neben den Rollen-Tabs
  — bräuchte eine neue Aggregatabfrage für eine Zahl, die niemand angefordert hat.
- **Kontaktakte und Anlegen-Screen** teilen sich jetzt `Section` (lokal in
  `contact-form.tsx`) statt eigener `Card`s je Abschnitt — 200-px-Titel-und-Hinweis-Spalte
  neben einem Feld-Grid, Abschnitte durch eine Linie statt eines Kartenrahmens getrennt.
  **Diagnose bekommt einen eigenen Abschnitt**, getrennt von "Intern" — ein
  Gesundheitsdatum nach Art. 9 DSGVO soll nicht zwischen internen Notizen verschwinden
  können (Regel 12). Auf `contacts/new` erscheint das Feld nicht: eine Diagnose
  einzutragen, bevor der Kontakt überhaupt existiert, ist nicht, wofür das Feld gedacht
  ist. Regel 12 bleibt unverändert — Diagnose nur in Stammdaten und Rechnungsentwurf, nie
  in der Liste, nie geloggt.
- **Breadcrumb, zweite Ebene:** `useSecondBreadcrumbSegment()` in `app-topbar.tsx` kennt
  genau zwei Routen namentlich (`/_app/contacts/$contactId` → Kontaktname aus dem
  Query-Cache, den der Loader schon gefüllt hat; `/_app/contacts/new` → "Kontakt anlegen").
  Bewusst kein allgemeiner Registrierungsmechanismus für Routen — der Kommentar im Code
  sagt, wann das der richtige Schritt wird: beim zweiten Verbraucher, vermutlich ein
  Vorgang oder eine Rechnung unter einem Kontakt.
- Übersicht, Beziehungskarte, Rollen-Chips im Kopf und alle sechs Tabs (Termine bleibt,
  obwohl der Prototyp es als eigenen Reiter weglässt) unverändert in ihrer Logik, nur die
  Optik zieht mit.

## D7 — Zahlungen

Drei Seiten werden eine. `routes/_app/payments.tsx` hat zwei Reiter, `billable.tsx`,
`invoices.index.tsx` und `receivables.tsx` sind ersatzlos gelöscht — harter Schnitt, keine
Weiterleitungen: nichts ist produktiv, es gibt keine Lesezeichen zu schonen.

- **Reiter im URL-Zustand:** `?tab=invoices`, Abwesenheit heißt erster Reiter, wie bei
  `services.tsx`. Der Filter des zweiten Reiters ist ein eigener Parameter (`?filter=overdue`)
  und wird beim Reiterwechsel verworfen statt mitgeschleppt. **Die Massenauswahl des ersten
  Reiters steht bewusst nicht in der URL:** sie ist eine flüchtige Absicht, und sie ist eine
  Liste von `activity_item`-IDs — mittelbar also, was in welcher Sitzung passiert ist (Regel 12).
- **Offene Vorgänge** (`components/billable-list.tsx`): nach Kontakt gruppiert, mit der
  dreiwertigen Kopf-Checkbox aus D2 — deren erster Verbraucher; vorher las eine teilweise
  ausgewählte Gruppe als gar nicht ausgewählt. Feste Fußzeile mit Anzahl und Betrag statt eines
  Knopfes im Seitenkopf, der bei vielen Kontakten genau dann aus dem Bild lief, wenn die Auswahl
  interessant wurde. Der Vorgangsstatus wird weiterhin angezeigt und filtert nicht.
- **Rechnungen** (`components/invoice-list.tsx`): **ein** Chipband statt zweier. Die beiden
  alten Seiten filterten auf zwei Achsen — Rechnungsstatus und Zahlungsstand —, aber ein
  Dokument ist in *einem* Zustand. Die zusammengeführte Liste heißt `invoiceListFilters` in
  `packages/shared`; `matchesInvoiceListFilter` ist die eine Definition und braucht neben dem
  abgeleiteten Zustand auch `invoice.status`, weil zwei der sechs Antworten sich am Zustand
  allein nicht ablesen lassen: ein Entwurf sieht für `invoicePaymentState()` wie „offen" aus,
  und „Storniert" muss auch Stornodokumente (`cancellation`) finden — was der Vorgänger
  `matchesReceivableFilter` nicht tat. Das war ein Fehler, keine Entscheidung.
  Dazu `ColumnPicker` mit `invoiceListColumns`.
- **`/api/receivables` ist gelöscht** — Route, `domain/receivables.ts`, dessen Test und die
  Client-Funktion. Die zusammengeführte Liste braucht auch Entwürfe und liest deshalb
  `/api/invoices`, womit `listReceivables` seinen letzten Aufrufer verlor. Die Begründung, die
  daran hing („in memory statt SQL, damit die Statusregel nur einmal existiert"), steht jetzt
  an `invoice-list.tsx`; die zwei Domänentests, die über die Liste gingen, fragen die Regel
  direkt.
- **PDF-Lücke geschlossen:** Die Diagnose war seit D1 gespeichert und im Entwurf editierbar,
  wurde aber **nie gedruckt** — obwohl das Datenmodell in CLAUDE.md „appears on the draft and
  the PDF only" behauptete. Sie steht jetzt über den Positionen, auf einer Stornorechnung
  nicht (die trägt auch keinen Einleitungstext). Zwei Tests in `render.test.ts`.
- **Farbsemantik:** neues Token `--warning`, in „Nacht" heller überschrieben. Die drei
  hartcodierten `amber-500`-Stellen (`contact-overview.tsx`, `invoice-send-dialog.tsx`,
  `sync-conflicts.tsx`) ziehen jetzt mit dem Theme — vorher blieb der Warnkasten im
  Dunkelmodus hell. Die Überfällig-Zeile ist `bg-destructive/10` statt `/5`: fünf Prozent auf
  einer ohnehin dunklen Fläche sind keine Markierung. `--destructive` bleibt in den drei
  hellen Themes geerbt; auf „Rosé" trägt es, weil dessen Hintergrund mit Chroma 0.006
  praktisch neutral ist.

## D7.5 — Totes aufräumen

Ein Durchgang durchs ganze Repo nach der neuen Konvention „Delete code that nothing uses".
Kein Verhalten ändert sich; alles hier ist Entfernen oder Erklären.

- **Vier Endpunkte für einzelne Datensätze** waren nie erreichbar, weil die Listen dieselben
  Spalten liefern: `GET /api/notes/:noteId`, `/api/services/:serviceId`,
  `/api/service-groups/:groupId` sind weg. `getService` und `getServiceGroup` gingen mit —
  ihr einziger Leser war danach `service.test.ts`, das jetzt über `listServices`/
  `listServiceGroups` nachlädt und damit die Abfrage prüft, die die Anwendung wirklich fährt.
  `getNote` bleibt: `note-lock.ts` ruft es.
- **`GET /api/health` bleibt** und trägt jetzt einen Kommentar, der sagt warum: der
  `HEALTHCHECK` im Dockerfile und Coolify hängen daran. Ohne diesen Satz fällt die Route
  beim nächsten Aufräumen.
- **`tenant.name` ist weg** (Migration `0031`). Geschrieben von Seed und Fixtures, gelesen von
  nichts — der Praxisname steht in `practice_settings.practice_name`. Das Namensargument von
  `createTenant()` fiel an 22 Stellen mit weg.
- Gelöscht ohne Ersatz: `ui/separator.tsx`, `getNumberRange`, `checkViolationConstraint`,
  `CONTENT_WIDTH`, `isLocked`, `PATIENT_ROLE_CODE`, `BILLING_RECIPIENT_RELATION_CODE`,
  `logoutAllSessions`, `sumPayments`, zehn nur deklarierte Typaliase, drei `messages`- und
  43 `strings`-Schlüssel.
- **`BILLING_RECIPIENT_RELATION_CODE` war eine doppelte Definition**, nicht bloß ungenutzt:
  `domain/invoice-send.ts` hält sein eigenes `BILLING_RECIPIENT` neben der Abfrage. Von zweien
  blieb die mit einem Aufrufer.
- **Was nur der Test von außen braucht**, ist nicht gelöscht, sondern benannt: `auth.ts` trägt
  einen Absatz über der Session-Arithmetik, `pushQueue`/`pullRemote`, `resolveRecipient`,
  `canonicalNote`, `clearFlows`, `contrastRatio`, `isRealDate`, `SLOT_RELEASING_STATUSES` und
  `recipientSnapshotSchema` je einen Satz. Der Grund gehört an den Code, sonst ist der nächste
  Durchgang derselbe Durchgang.

## D8 — Vorgänge

Keine Migration. Der Kontaktname kommt über einen Join, der Art-Filter ist ein Query-Parameter,
die Kennzahlen sind eine Aggregatabfrage.

- **Inline statt eigener Screen, eine Komponente, drei Behälter.** `ActivityDetail` (lesen) und
  `ActivityForm` (bearbeiten) sind aus dem 1083-Zeilen-Dialog herausgelöst. Die Vorgangsliste und
  der Vorgänge-Reiter des Kontakts klappen sie in der Karte auf; der Kalender behält einen
  Dialog, weil Wegnavigieren dort das Wochenraster mitnähme — `activity-dialog.tsx` ist jetzt
  eine Hülle um dieselben zwei Komponenten und entscheidet nichts mehr selbst. Das eigene
  Argument für einen Screen (drei Einstiege vereinheitlichen) hält nicht: der Kalender bräuchte
  seinen Behälter ohnehin.
- **Kein Reset-Effekt mehr.** Der Dialog blieb montiert und musste bei jedem Öffnen alles
  zurücksetzen. Das Formular wird jetzt pro Datensatz neu montiert (`key`), liest seinen
  Anfangszustand einmal aus den Props und hat keinen Reset-Pfad, in dem etwas stehenbleiben
  könnte.
- **Zwei Abschnitte statt einer Chronologie:** „Kommend" aufsteigend, „Bisher" absteigend,
  getrennt am Zeitpunkt und nicht am Tag — um zehn Uhr ist die Neun-Uhr-Sitzung vorbei.
- **Kennzahlen als eigener Endpunkt** (`GET /api/activities/summary`), anders als D7s
  Rechnungsliste, die ihre 200 geladenen Zeilen selbst zählt. Der Unterschied steht als
  Kommentar an `activitySummary`: das Standardfenster hier sind 120 Tage, für eine laufende
  Praxis rund 700 Vorgänge — der Browser kann nicht zählen, was er nie geholt hat. Die Zahlen
  beschreiben das Fenster, nicht die Auswahl, sonst änderte ein Chip die Zahl auf sich selbst.
- **`unbilledCentsInRange` liegt in `billable.ts`**, nicht bei den Vorgängen: es ist der dritte
  Leser von `claimedByAnActiveInvoice`, und alle drei müssen auf einer stornierten Rechnung
  gleich antworten. Ohne Status und ohne Schnitt bei heute — die Zahl ist genau die Summe der
  Zeilen mit „Offen", damit man die Spalte nachaddieren kann.
- **Keine Spaltenauswahl** (Begründung als Kommentar an `activity-list.tsx`) und **keine zweite
  Breadcrumb-Ebene** — es gibt keine URL für einen einzelnen Vorgang, also nichts zu benennen.
  Der D6-Vermerk „beim zweiten Verbraucher" bleibt zutreffend.
- **Sechs Dinge, die der Vorgänge-Prototyp weglässt, sind geblieben** und stehen als Tabelle im
  Kopf von `activity-form.tsx`. Zwei davon tragen Regeln: ohne das Abrechenbar-Häkchen ist
  Regel 6 nicht bedienbar, ohne den Terminstatus ließe sich ein Termin anlegen, aber nie absagen.
- Beim Browser-Durchgang gefunden und mitbehoben: der Kalenderdialog hieß „Vorgang bearbeiten"
  über einer Leseansicht, und der Schließen-Knopf jedes Dialogs trug das englische „Close" aus
  der shadcn-Vorlage.

## D9 — Kalender

Keine Migration. Der einzige Screen, der ganz neu entsteht.

- **Drei Ansichten von fünf.** Tag, Arbeitswoche (Standard), Woche. Der Monat fiel weg, weil
  seine Zellen bei sechs Sitzungen am Tag „+5 weitere" anzeigen würden — der Mini-Monat in der
  Leiste erledigt die Navigationshälfte auf einem Vierzigstel der Fläche. Die Listenansicht fiel
  weg, weil es sie gibt: ein Termin kann ohne Vorgang nicht existieren, also sind die Slots
  einer Woche die Vorgänge einer Woche, und das ist D8.
- **Zwei Spalten statt drei.** App-Sidebar 234 + linke Leiste 238 + rechte 330 hätten auf einem
  1440er Bildschirm 118 px pro Tag gelassen, und ein Block braucht rund 110 px. Die linke Leiste
  trug „Neuer Termin" (gehört in den Kopf), den Mini-Monat (steht jetzt rechts) und den
  Terminfinder (ist D9.5) — ohne den bleibt für eine dritte Spalte nichts übrig.
- **Volle 24 Stunden, beim Öffnen auf 07:00 gescrollt.** Der Vorgänger zeichnete 07:00–21:00 und
  klemmte alles außerhalb an den Rand. Für einen Google-Block war das gewollt; für einen echten
  Termin um 06:00 war es eine Falschanzeige — er stand dort, wo 07:00 ist, und sah richtig aus.
- **Ziehen mit Zurückspringen.** Optimistisch verschieben, bei 409 den Cache zurückrollen und
  die Meldung zeigen. Ohne Rückroller bliebe der Block an der falschen Stelle, bis irgendein
  späterer Refetch ihn zurückschöbe. Drei Schichten: Vorschau im Browser (nur beratend, kennt
  nur die geladene Woche), `moveAppointment` in der Domäne, `appointment_no_overlap` in der
  Datenbank — nur die letzte entscheidet. **Auf einen Google-Block darf man ziehen:** eine Regel,
  die bei Verbindungsausfall erlaubt, was mit Verbindung verboten wäre, ist die schlechteste
  Sorte.
- **`moveAppointment` schreibt beide Enden.** Der Fund aus der Planung: `updateAppointment`
  verschob nur die Terminzeile, `activity.occurred_at` wäre stehengeblieben. Die alte allgemeine
  `PUT`-Route ist ersetzt durch `POST /:id/move`, das nur `{startsAt, endsAt}` nimmt — Status,
  Titel und Notiz werden am Vorgang bearbeitet, und eine Route, die sie hier annähme, wäre ein
  zweiter Weg dorthin. Ein Test hält den Invariant fest und sagt, dass er nicht gelockert wird.
- **`activity-dialog.tsx` ist gelöscht.** Die Leiste ist der dritte Behälter für
  `ActivityDetail`; das Modal verdeckte beim Verschieben genau das, was man sehen muss.
- Beim Browser-Durchgang gefunden: `ActivityDetail` und `ActivityForm` fragten mit `lg:`/`sm:`
  nach der **Fenster**breite und zerlegten sich in der 380-px-Leiste. Beide messen jetzt per
  Container-Query den Platz, den sie bekommen haben — siehe die Notiz unten.

## D9.5 — Freien Termin finden

Der Teil aus D9, der Öffnungszeiten braucht. Migration `0032`.

- **`opening_hour`: eine Zeile pro Zeitfenster, nicht pro Wochentag.** Mittagspause = zwei
  Zeilen, nur vormittags = eine, geschlossen = keine. „Geschlossen" braucht kein Kennzeichen,
  es ist die Abwesenheit von Zeilen. Gegen JSONB entschieden, weil es hier echte Invarianten
  gibt: `ends_at > starts_at` als Check und ein EXCLUDE gegen Überschneidungen am selben Tag —
  dasselbe Mittel wie `appointment_no_overlap`, mit einem konstanten Datum vor der `time`,
  weil `time` allein nicht gist-indizierbar ist.
- **Kein Seed.** Eine leere Tabelle heißt „nicht hinterlegt", und die Suche antwortet mit
  `openingHoursSet: false` und einem Satz mit Link, statt 8 bis 18 Uhr zu erfinden.
- **Die Suche läuft auf dem Server, und Regel 13 wird dadurch strenger.** Sie holt die
  Belegtzeiten, rechnet damit und gibt sie **nicht zurück** — die Antwort sind freie Fenster und
  zwei Flags. In der Kalenderansicht müssen sie an den Browser, weil sie gemalt werden; hier
  nicht. Steht als Kommentar über `findFreeSlots`.
- **`privateCalendarsChecked` an zwei Stellen sichtbar**: als Hinweiskasten in der Leiste und
  als Farbton der Vorschläge selbst (`--warning` statt `--primary`). Wer den Kasten nicht liest
  und direkt in eine Fläche klickt, hat trotzdem gesehen, dass die Aussage schwächer ist.
- **Keine dritte Spalte, sondern der dritte Zustand der Leiste.** Die Treffer gehören ins
  Raster — eine Zeit an einem Tag ist dort ablesbar und in einer Liste nur beschreibbar — und
  die Eingabe ist ein Modus, kein Möbelstück.
- **Dauer aus der Vorgangsart.** Arten ohne hinterlegte Dauer stehen nicht in der Liste, und die
  Leiste sagt das mit Link in die Einstellungen, damit eine kurze Liste nicht wie ein Fehler
  aussieht.
- 22 Domänentests: Mittagspause, geschlossener Tag, abgesagt blockiert nicht, No-Show blockiert,
  Belegtzeit blockiert, Ganztagssperre, Übergriff vom Vortag, Viertelstundenraster, Kachelung,
  Vergangenes fällt weg, Google-Ausfall, Mandantentrennung, EXCLUDE.

---

## Slice 0 — Scaffold

No domain tables yet.

- pnpm workspace: `apps/server`, `apps/web`, `packages/shared`
- `docker-compose.yml` with Postgres 17 only, data in a bind mount under `.docker-data/`, on a non-default port to avoid clashing with other local projects
- Drizzle + drizzle-kit wired up, migration folder, empty schema
- Hono app with `GET /api/health`, error middleware, pino logger
- Vite + React 19 + TanStack Router with a single placeholder route, Tailwind, shadcn/ui initialized
- `apps/server/src/messages.ts` and `apps/web/src/lib/strings.ts` created, even if nearly empty
- `pnpm dev` runs Vite (5173, proxying `/api` to 3000) and the server (3000) together
- `pnpm build` builds the SPA into the server's static directory; `pnpm start` serves everything from `http://localhost:3000`
- `pnpm typecheck`, `pnpm test`, `pnpm lint` exist and pass
- `.env.example`, `.gitignore` (including `apps/server/data/` and `.docker-data/`)
- `README.md` with setup steps

**Done when:** a fresh clone reaches a working `http://localhost:3000` following only the README.

**As built.** Decisions taken in this slice, both deviating from the original stack note in CLAUDE.md and agreed before implementation:

- **Node 24 LTS** instead of Node 22. Node 22 is already in maintenance and ends April 2027; Node 24 is supported until April 2028. CLAUDE.md updated accordingly.
- **Biome 2.5** instead of ESLint + Prettier. One tool, one config file, React-hooks rules included. CLAUDE.md updated accordingly.
- **TypeScript 5.9.3**, deliberately not the newer native compiler (7.x). The type inference of Drizzle and Hono's `hc` is the load-bearing part of this codebase; the switch is a one-line bump later, because TypeScript only type-checks here and never emits for the frontend.
- Postgres on **host port 55432**.
- All dependency versions are pinned exactly, no caret ranges.
- `packages/shared` is consumed as a built package (`tsc` → `dist/`), not through a path alias — the same resolution in dev and in the production build.
- `apps/web/src/routeTree.gen.ts` is generated (`tsr generate` in `typecheck`, the Vite plugin in dev/build) and not in version control.

## Slice 1 — Tenant, user, login, practice settings

First vertical slice. It establishes the pattern every later slice copies.

- Tables `tenant`, `practice_settings`, `app_user`, `session`, with RLS policies created and disabled
- Seed: one tenant, one `practice_settings` row with fake but realistic master data, one user with a password from an env variable
- `domain/auth.ts`: argon2 verification, session creation, validation, expiry
- `middleware/auth.ts` and `middleware/tenant.ts` — tenant id derived from the session, never from the request
- Routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/PUT /api/settings`
- Session cookie `httpOnly`, `SameSite=Lax`, `secure` only when not on localhost
- UI: login page, app shell with sidebar navigation (Kontakte, Termine, Vorgänge, Rechnungen, Leistungen, Einstellungen — targets may be stubs), practice settings form
- Tests for `domain/auth.ts`

**Done when:** I can log in, edit the practice master data, reload and stay logged in, log out.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`session` carries `tenant_id`** on top of `user_id`, against the sketch, so
  the auth middleware resolves user and tenant in one select. The
  denormalization is held true by a composite foreign key
  `(user_id, tenant_id) -> app_user (id, tenant_id)`, which needs the extra
  `unique (id, tenant_id)` on `app_user`. A session cannot claim a tenant its
  user does not belong to; there is a test for it.
- **`app_user.email` is unique globally**, not per tenant — the login form has
  no tenant context — plus `check (email = lower(email))` so case cannot
  produce duplicates. The functional-index variant was the alternative; only
  one of the two, not both.
- **`invoice_template_path` / `letter_template_path` deferred to slice 6**,
  where the upload that fills them is built. Nothing on spec.
- **Tests run against a real Postgres from now on.** Isolation is one database
  per Vitest worker (`praxi_test_w1`, …), created and migrated on demand in
  `src/test/setup.ts`, truncated between test cases. The originally planned
  schema-per-worker does not work: drizzle-kit writes foreign keys as
  `REFERENCES "public"."tenant"`, so every worker would land on the same
  tables. `pnpm test` therefore needs `pnpm db:up`.
- **UUIDv7 from the `uuid` package** (`src/id.ts`). Postgres 17 has no native
  `uuidv7()`, and ids are generated in the application anyway.
- **URL paths are English** (`/login`, `/settings`, `/contacts` …), consistent
  with the identifier rule; all visible labels stay German. The glossary row in
  CLAUDE.md that was thought to say otherwise does not exist — nothing to
  change there.
- **Sessions**: 32 random bytes base64url, stored only as SHA-256, 14 days
  sliding, written back at most once an hour. Logout deletes the row; expired
  rows are cleared out on each login. Unknown email and deactivated account
  both cost a real Argon2 verification against a dummy hash produced with the
  same parameters, so neither answer nor timing tells accounts apart.
- **Seed** is `pnpm db:seed`, idempotent, refuses an empty or too short
  `SEED_USER_PASSWORD` and never overwrites the password of an existing user.
- Two things found while building, both fixed here:
  `@hono/zod-validator` answers validation failures with its own English body
  that echoes the rejected input — wrapped in `middleware/validate.ts` so it
  throws instead and only field *names* reach the log (rule 12). And `shadcn`
  pulled `next-themes` in with the toaster; removed, the toaster follows the
  operating system.

## Slice 2 — Contacts and roles

- Tables `contact` and `contact_role`
- `domain/counter.ts`: a reusable `SELECT ... FOR UPDATE` counter, used here for `contact_number` and reused for invoice numbers in slice 6. Build it properly now, at a low-risk site.
- Form adapts to `kind`: person fields versus organization fields
- Roles as a multi-select, several roles per contact, `since` recorded
- Routes: list with search across name, company name and contact number; get, create, update, archive (soft, via `archived_at`, no hard delete)
- UI: contact list (TanStack Table, role filter, archived hidden by default), create/edit form, contact detail page with tabs — Stammdaten filled, Notizen / Vorgänge / Termine / Rechnungen present but empty
- Tests for the counter, including a concurrent-call test

**Done when:** I can create people and organizations, assign several roles, search and archive them.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`number_range` created now with `code` and `next_value` only**; `prefix`
  and `padding` arrive in slice 6 with the upload that fills them.
  `domain/counter.ts` may create a missing row **only for whitelisted codes**
  (currently `contact`). For anything else — `invoice` above all — a missing
  row raises `MissingNumberRangeError`: that range is configured on purpose and
  may continue a numbering from the previous system, so a silent start at 1
  would reissue existing numbers. Both branches are tested.
- **Enum versus check constraint** is now a written rule under Conventions in
  CLAUDE.md. `contact.kind` is a `pgEnum` (structurally fixed); `contact_role.role`
  is `text` with the named constraint `contact_role_role_check` (the set is
  expected to change). The TypeScript union comes from the Zod schema in
  `packages/shared` and the Drizzle type is derived from it.
- **`contact_kind_fields` check constraint** enforces which fields belong to
  which kind. `vat_id` is deliberately *not* restricted to organizations — a
  sole trader is a person and can have a VAT id.
- **Generated column `sort_name`** (surname first, company name for
  organizations) for ordering; displaying goes through `formatContactName()` in
  `packages/shared`, which slice 6 reuses for `recipient_snapshot` so the
  stored name reads exactly like the one on screen.
- **The search term never enters the URL.** Role filter and "show archived" are
  router search params; the free-text term is component state, because in this
  application it is almost always a patient's name and the URL reaches browser
  history and autocomplete.
- **Roles travel inside the contact payload** and are reconciled in the same
  transaction. Existing rows are updated in place, never deleted and
  recreated — that is what keeps `since` from being reset on every save.
- **Composite foreign key** `(contact_id, tenant_id) -> contact (id, tenant_id)`,
  the same pattern as `session` in slice 1.
- **No index for the search** — a leading-wildcard `ILIKE` cannot use a btree,
  and at the expected row count a sequential scan beats maintaining `pg_trgm`.
  Two indexes from the first draft were dropped for the same reason: an
  `archived_at` index (the filter matches nearly every row) and a
  `contact_role (contact_id)` index (`unique (contact_id, role)` already leads
  with that column).

**`updated_at` decided for the whole schema:** a generic `set_updated_at()`
trigger, created in migration `0002` and attached to every table including the
four from slice 1; `$onUpdate` was removed from the Drizzle schema. The first
attempt skipped writes that changed nothing, which does not work: Postgres
fills generated columns *after* `BEFORE` triggers, so `NEW IS DISTINCT FROM OLD`
is always true on a table with one. Migration `0005` corrects it — `updated_at`
now means *last write*, uniformly.

Migration `0002` also asserts the database runs under the ICU provider with
locale `de-DE`, checked via `datlocprovider`/`datlocale`; `datcollate` still
reports the libc locale under ICU and would have passed a wrongly built
cluster.

## Slice 3 — Services and service groups

Deliberately small — it confirms the slice-2 pattern is repeatable.

- Tables `service`, `service_group`, `service_group_item`
- CRUD for both, `active` flag instead of deletion
- Group editor: assemble services with quantity and order
- **No pricing logic, no history.** The catalogue is a template store; see CLAUDE.md rule 5.

**Done when:** the catalogue is maintainable and inactive entries no longer appear in selection lists.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`short_code` optional but unique where given**, via a partial unique index.
  A required code would force one onto services nobody ever types.
- **`default_price_cents >= 0`.** A discount is not a service; rule 5 handles
  it by editing the price on the `activity_item`. Relaxing this later is a
  `DROP CONSTRAINT` that cannot fail, which makes it the cheaper direction.
- **`quantity` is `integer`** here and on `activity_item` in slice 4. A session
  is the unit; length lives in `duration_min`.
- **`active` travels in the payload**, no `activate`/`deactivate` routes. This
  differs from archiving a contact on purpose: that is a guarded action with a
  confirmation, this is a checkbox in a form, and two paths to one outcome
  would be worse than the inconsistency.
- **Group items travel in the group payload** and are replaced wholesale in one
  transaction. Unlike a contact's roles these rows carry nothing worth
  preserving — no date, no history — so delete-and-insert is both simpler and
  correct, and `position` is rewritten from the array index.
- **No unique constraint on `position`**, so reordering does not need a
  deferred constraint or a shuffle through spare values.
- **Money formatting lives in `packages/shared`** (`formatEuro`,
  `formatEuroAmount`, `parseEuroAmount`), not in the frontend: slice 6 formats
  the same amounts server-side for the PDF, and a printed invoice must not read
  differently from the screen it was checked on. `parseEuroAmount` is the only
  logic in this slice testable without a database, and it has the tests.
- **The forms are dialogs, not routes** — again a deviation from the contacts
  pattern. A catalogue entry has seven fields and is maintained by jumping
  between many of them; keeping the list in view is worth more here than
  matching the contact page.
- **Seed** extended with a plausible HPP catalogue: seven services, one group
  (`Prüfungsvorbereitung Kompakttag`, 4× Prüfungsvorbereitung + 1× telefonische
  Beratung) so slice 4 has a real group to resolve. `fee_code` is left empty
  throughout — inventing GebüH numbers would put made-up billing codes on real
  invoices. `pnpm db:seed:services` runs that section alone; the seed never
  updates an entry that already exists.

Found while building: `uniqueViolationConstraint` read the SQLSTATE off the
thrown error directly and therefore never matched — Drizzle wraps driver errors
in a `DrizzleQueryError` and the code sits on `cause`. A duplicate short code
came back as a generic 500 with no complaint anywhere. `db/errors.ts` now walks
the cause chain, and `db/errors.test.ts` asserts it against a genuine Drizzle
error rather than a hand-built object.

## Slice 4 — Activities and appointments

Two tables in one slice because they are created together in practice.

- Tables `activity`, `activity_item`, `appointment`, plus the `btree_gist` extension and the overlap constraint on `appointment` in a hand-written migration:

```sql
ALTER TABLE appointment ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'cancelled_late'));
```

  SQLSTATE `23P01` is caught and translated into a readable German message.
- `domain/activity.ts`: creating an activity copies description, fee code, price and duration from the chosen services into `activity_item`; picking a `service_group` resolves it into individual items immediately and stores no group reference. Free items without `service_id` are supported.
- Creating an activity also creates its appointment by default, with an option to skip it. `activity.appointment_id` is nullable and unique.
- `billable` toggle per item, and the ability to add further items — this is how a no-show becomes an Ausfallhonorar
- Routes: activities per contact and per date range, create, update, delete; appointments by date range, reschedule, change status
- UI: week and day calendar view, create from calendar and from the contact page, activity editor with its item list, Vorgänge and Termine tabs on the contact
- Tests: price copy independent of later catalogue changes, group resolution, overlap rejection, cancelled appointments not blocking a slot

**Done when:** I can book an appointment with services, change the catalogue afterwards without the booking changing, and mark a no-show with an Ausfallhonorar.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`appointment.contact_id` is NOT NULL**, against the sketch. Every
  appointment here belongs to an activity for a contact, and slice 9's private
  blockers arrive from Google as read-only intervals that are never stored — a
  nullable column nothing can fill is the same dead weight as the template
  paths would have been in slice 1. A local "block time" feature later is one
  migration.
- **The `google_*` columns wait for slice 9.**
- **`activity.duration_min` stays**, nullable and purely descriptive. Redundant
  while there is an appointment, but an activity documented afterwards has no
  calendar entry to take a length from. Nothing derives from it.
- **Items are copied on the server.** The submitted union is `service` (the
  domain copies out of the catalogue), `group` (resolved into individual items,
  no group id stored) or `custom` (taken as given). The client could copy
  itself — it has the catalogue loaded — but then a rule-5 core rule would sit
  in a form and be untestable.
- **`activity_item` rows are stable across an edit**, updated in place rather
  than replaced, because slice 6 points `invoice_line.activity_item_id` at
  them. `custom` therefore carries an optional `id`.
- **`ON DELETE SET NULL (appointment_id)` with the column list.** Without it
  Postgres nulls every column of the key, `tenant_id` included, and the delete
  fails against `NOT NULL`.
- **`unit_price_cents` has no sign restriction**, unlike the catalogue. Rule 5
  grants discounts by leaving this price free, so a negative one-off line is
  the intended route.
- **The overlap constraint**: `tstzrange` is half-open, so back-to-back slots
  do not clash; `no_show` keeps the slot, only a cancellation releases it; it
  applies to all of time, past included. All three are written at the
  constraint in migration 0009 and covered by tests.
- **`activity.type` and `appointment.status` are `text` with a named check
  constraint**, per the Conventions rule — both are marked `?` in CLAUDE.md.
- **No standalone appointment creation.** Appointments come into being with
  their activity; the appointment routes read a range and move or restatus one
  entry.

Added on review, and worth keeping: **the composite foreign key carries
`contact_id`**, so an activity of one contact cannot hold the appointment of
another. Verified in a throwaway database before writing the migration that
`ON DELETE SET NULL (appointment_id)` works on a three-column key — it does,
and only `appointment_id` is nulled.

Found while building:

- **drizzle-kit cannot express the `SET NULL` column list.** Migration 0008
  emitted a bare `ON DELETE SET NULL`, which would have failed at runtime;
  0009 replaces the constraint under the same name so drizzle's snapshot still
  matches the TypeScript schema and no phantom drift appears. Note that
  `db:generate` diffs the schema against its own snapshot and never looks at
  the database — which is exactly why the pre-launch baseline has to come from
  `pg_dump`.
- **`Date.parse` is not a validator.** V8 answers `Date.parse('gestern:00Z')`
  with 1 January 2000 rather than `NaN`, and rolls `2026-02-31` over to 3
  March. `packages/shared/src/datetime.ts` checks the shape with a pattern and
  compares the round trip; a `Number.isNaN` guard alone let both through.
- The slice-3 test asserting that nothing outside the catalogue references a
  service caught `activity_item.service_id` and failed. That reference is the
  record of origin rule 5 explicitly allows, so the test was narrowed to what
  the rule actually protects — no reference to a service *group* — plus an
  explicit allow-list for service references.

## Slice 5 — Notes, files, locking

The most rule-heavy slice. See CLAUDE.md rule 7.

- Tables `note`, `note_file`, plus the `protect_locked_note` trigger and the equivalent guard on `note_file`
- File upload to `data/files/`, served only through an authenticated route, never statically
- `domain/note-lock.ts`: canonical serialization including file hashes, `lockNote`, `verifyChain`
- Addenda via `corrects_note_id`
- Routes: notes per contact and per activity, create, update while unlocked, lock, add addendum, upload and download files, verify chain
- UI: Notizen tab on the contact with a chronological list, editor for unlocked notes, lock button with a confirmation dialog stating plainly that this cannot be undone, addenda indented under the note they correct, chain verification view, notes also visible on the activity
- Tests: chain across several notes, tamper detection, trigger blocks updates to locked rows and their files, addendum flow

**Done when:** I can document a session, attach a file, lock it, supplement it with an addendum, and the verification reports a manually tampered row as broken.

**As built.** Decisions taken in this slice, agreed before implementation:

- **The canonical serialization is frozen and documented in full** at
  `domain/note-hash.ts`: six keys, alphabetically sorted, no whitespace, UTF-8,
  `createdAt` at millisecond precision because that is what the driver returns
  from a `timestamptz`, file hashes sorted ascending, no Unicode normalization.
  The sort is *executed* (`JSON.stringify(value, [...keys].sort())`) so a
  reordered object literal cannot shift it. `note-hash.test.ts` pins both the
  exact string and a hard-coded digest; if it fails, the format changed and the
  code is wrong, not the expectation. A future field needs a second hash
  version, never an edit to this one.
- **`note.type` is `document`, not the sketch's `file`** — a note of type
  "file" next to a table `note_file` reads as if it were the attachment.
- **Files and the lock**: the hash covers the files as they are at the moment
  of locking. `lockNote` and `addFile` both take `SELECT … FOR UPDATE` on the
  note row, so an upload cannot slip between reading the files and writing
  `locked_at`. The `note_file` trigger fires on **INSERT** as well — without
  that, a file could hang on a locked note and appear in no hash at all.
- **Layout** `files/{contactId}/{noteId}/{fileId}.{ext}`, `storage_path` stored
  **relative** to `DATA_DIR` so a move to a server is a copy plus one variable.
  No path segment comes from user input, and the uploaded name is never one:
  a file name is clinical content (rule 12) and lives only in `file_name`.
  `domain/file-store.ts` asserts containment under the root anyway.
- **Orphans**: rows are committed first, bytes removed second — a leftover file
  is recoverable garbage, a row pointing at a missing file is data loss. The
  failure is logged with ids only, and `pnpm files:orphans` lists what is
  unreferenced (`--delete` removes it). Uploads go the other way: row inserted,
  bytes written, commit last, so a full disk rolls back cleanly.
- **`verifyChain` reads the file bytes by default** and the UI never turns that
  off; `{ checkFiles: false }` exists as a parameter for a later, larger
  installation. The report separates **content** (the row was altered),
  **link** (the chain was cut) and **file** (bytes swapped or missing) and
  names each note by date and id, because the three have different causes.
- **Two partial unique indexes** — `note_chain_link_key` and
  `note_chain_head_key` — make a forked chain unreachable. Nothing queries
  them; `COMMENT ON INDEX` says so in the database so a future cleanup does not
  drop them as unused.
- **`note.activity_id` is `ON DELETE RESTRICT`**, not set null: nulling is an
  UPDATE, and on a locked note the trigger would answer "locked note is
  immutable" when someone deletes an activity. `deleteActivity` checks first
  and refuses with something readable. `activity` gained
  `unique (id, contact_id, tenant_id)` as the target of the three-column key.
- **Uploads are sniffed, not believed**: PDF, JPEG, PNG, WebP, HEIC, TIFF by
  magic bytes, 25 MB, and the stored `mime_type` is the detected one. Downloads
  always send `nosniff` and a sandbox CSP, and only those types may render
  inline.
- **Attachments are managed on a saved note.** The everyday order is write,
  save, attach, lock; allowing an upload before the first save would need a
  second code path with a half-created note.

Found while building:

- **The trigger in CLAUDE.md rule 7 silently cancelled every delete.** It ended
  with `RETURN NEW`, and in a `BEFORE DELETE` trigger `NEW` is NULL — a BEFORE
  row trigger returning NULL cancels the operation with no error at all. So
  deleting an *unlocked* note reported success and left the row in place; the
  locked case only worked because it raises before reaching the return.
  Migration `0012` replaces the function with `RETURN coalesce(NEW, OLD)`, and
  the snippet in CLAUDE.md is corrected.
- **drizzle-kit ordered migration 0010 wrongly**, emitting note's three-column
  foreign key before the `unique (id, contact_id, tenant_id)` on `activity`
  that it references. Moved by hand before the file had ever run.
- **Asserting on a trigger's message needs the cause chain**, the same trap as
  slice 3: `rejects.toThrow(/locked note is immutable/)` fails even though the
  trigger fired, because Drizzle's own message is only the failed SQL.
  `db/errors.ts` gained `raisedMessage()` for SQLSTATE P0001, and the tests use
  it — otherwise the assertion would have passed for any failure whatsoever.
  The trigger tests deliberately go around `domain/` and write to the table
  directly, including the combination that matters: attach a file, lock the
  note, then try to update and delete the file.

## Slice 6 — Invoices: draft, finalize, PDF

See CLAUDE.md rules 8, 9, 10 and 11.

- Tables `invoice`, `invoice_line`, `number_range`, `text_template`, plus the immutability trigger for finalized invoices and the guard on `activity_item` referenced by a finalized invoice
- Carried over from slice 4 and done: `invoice_line.activity_item_id` has `ON DELETE RESTRICT`, and `syncItems` and `deleteActivity` refuse before the foreign key does, naming the invoice.
- `domain/number-range.ts` (reusing the slice-2 counter): editable `next_value`, collision check on assignment with a clear error
- `domain/finalize-invoice.ts`: number, line snapshots, text snapshots, `recipient_snapshot`, total, PDF, hash, status
- Billable query per CLAUDE.md rule 6, including the cancelled-invoice exclusion — write the test for that case before the implementation
- `pdf/din5008.ts` with the Form B constants, `pdf/invoice.tsx` for the content, `pdf/overlay.ts` merging onto the uploaded template with pdf-lib; template page 2 backs all following pages when present
- Template upload in the practice settings
- Text templates: manage intro and outro blocks, mark defaults and the paid variant
- Routes: create draft from selected billable items or empty, edit lines, choose texts, preview PDF, finalize, finalize with "Betrag erhalten", download
- UI: invoice list with status filter, draft editor, billable-items picker per contact, finalize confirmation
- Tests: number assignment including concurrency and collision, snapshotting, trigger blocks changes to finalized invoices, totals

**Done when:** a finalized invoice has a number, a PDF on disk with a stored hash, correct DIN 5008 placement on the template, and cannot be modified.

After this slice: UI and theme pass with Claude Design before continuing with slice 7.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`invoice.number` is text, frozen**, with `number_prefix` and `number_value`
  stored next to it. Deriving the display from prefix and padding on read would
  let a later padding change rewrite numbers that have already been issued. The
  unique key is `(tenant_id, number_prefix, number_value)` and not
  `(tenant_id, number_value)`: rule 8 resets the range every year, so value 1
  exists once per year and the narrower key would have rejected the first
  invoice of every new year — in production, at the turn of the year. What the
  two columns are actually for is gap detection without string surgery.
- **Billable means: on no active, *real* invoice.** Three conditions, each of
  which loses money or breaks a rule if left out — `status <> 'cancelled'`,
  `type <> 'cancellation_invoice'`, and drafts count as claimed. The middle one
  is the subtle one: a cancellation invoice repeats the original's
  `activity_item_id` so the document shows what it takes back, and it is itself
  finalized and not cancelled, so without excluding its type cancelling would
  leave the items claimed forever — the opposite of rule 9. The same condition
  sits in `protect_billed_activity_item`. Written and tested now although
  cancelling arrives in slice 7; the test covers all three cases.
- **The number range is never created on demand.** `invoice` is set up by hand
  in the settings, because it may continue a numbering from the previous
  system. No production path lowers `next_value` or hands a number back — a
  discarded draft never held one, and there is no reset endpoint. The manual
  maintenance is the single exception and says so in a comment.
- **The preview renders into memory.** No file, no path, no hash; a test counts
  the directory before and after.
- **The PDF is written inside the transaction.** The file system knows no
  rollback, so one failure mode has to be accepted: in this order a crash can
  only leave an orphaned file, which `pnpm invoices:verify` finds. The other
  way round it would leave a finalized invoice without a document, and that is
  not repairable — a PDF rendered later is a different document, and the stored
  `pdf_hash` would no longer match. A `catch` unlinks the file and rethrows,
  and the path is recorded *before* the write so a half-written file is cleaned
  up too.
- **One update, not two.** The obvious shape — snapshot first, hash after the
  render — is forbidden by the `invoice_draft_fields` check constraint, and
  rightly: a row mid-finalization would be a draft carrying a number. So the
  invoice is assembled in memory, rendered, and stored by the single statement
  that also sets `status = 'finalized'`. There is no moment at which a
  half-finalized row exists, not even inside the transaction.
- **The PDF is pinned, not excluded from comparison.** `/CreationDate`,
  `/ModificationDate`, `/Producer` and `/Creator` are all set from the invoice
  date, never from the clock, on both layers. The document is therefore a pure
  function of the stored data, the preview is byte-identical to what is later
  filed, and the test compares two complete renders by hash instead of
  excluding bytes — which would have hidden any other source of variance.
  Standard Helvetica, so no font file is embedded and nothing is fetched.
- **No template reference on the invoice.** Picking a text block copies its
  body into `intro_text` / `outro_text`, where it stays adjustable for that one
  invoice. A foreign key to a mutable table on a row that becomes immutable
  would need `ON DELETE SET NULL`, which is an UPDATE the trigger refuses —
  the same trap as the notes in slice 5.
- **`pnpm invoices:verify`** checks existence and SHA-256 for every finalized
  invoice, and deliberately has no re-render mode: the right answer to a
  missing document is cancel and reissue, which is a bookkeeping act.
- **Deferred, consistently with earlier slices:** `cancels_invoice_id` and
  `cancelled_by_invoice_id` arrive in slice 7 with the code that fills them
  (the enum value `cancelled` exists now, because the billable query needs it);
  "Betrag erhalten" arrives in slice 8 with the `payment` table, since it also
  records a payment — `is_paid_variant` on the text block is built now;
  `letter_template_path` waits for a letter module.

Found while building:

- **drizzle-kit ordered migration 0013 wrongly** again — the same class of
  problem as 0010: note's foreign key before the unique constraint it
  references. Reordered by hand before the file had ever run.
- **The check constraint caught a design mistake of mine.** The two-update
  finalize order that seemed obvious would have produced a draft carrying a
  number, which `invoice_draft_fields` forbids. The constraint was right and
  the plan was wrong; the single-statement version is both simpler and
  stronger.
- **pdf-lib rewrites metadata on `save()` *and* on `load()`.** `save()` stamps
  `/Producer` and `/ModificationDate` from the wall clock unless
  `updateMetadata: false` is passed — which would have made the determinism
  test fail at random, since a PDF date has second precision and two renders in
  the same second still match. `load()` does the same to the in-memory
  document, which is how the test first appeared to accuse the renderer of
  something it had not done. Both are now passed explicitly, with the reason at
  the constant.
- **A cancellation invoice cannot insert its lines while finalized** — the
  `protect_finalized_invoice_line` trigger refuses, and
  `invoice_draft_fields` refuses a draft that already carries a number. Slice 7
  therefore has to use the same shape as `finalizeInvoice`: rows first as a
  draft, then one update that finalizes. The test that builds a cancellation
  document by hand already does it that way.

## Slice 6.5 — Roles and relations

Inserted between 6 and 7. `contact_role` mixed up two different things: a role
is a property of one contact, while a guardian or a billing recipient is a
relation to another one and means nothing without the counterpart. Both sets
are configurable from now on. See CLAUDE.md rule 4.

- Tables `contact_role_type`, `contact_relation_type`, `contact_relation`;
  `contact_role.role` becomes `role_code` with a composite foreign key instead
  of its check constraint
- `domain/contact-type.ts` for both catalogues, `domain/contact-relation.ts`
  for the relations
- Settings section "Rollen und Beziehungen"; roles in the contact form come
  from the catalogue; relations section on the contact record; role tabs on the
  contact list
- Seed: system entries `patient`, `guardian`, `billing_recipient`, plus
  `prospect`, `participant`, `parent_of`, `spouse_of` as ordinary ones

**Done when:** I can add a role type of my own, mark a relation as exclusive,
and see the same relation from both records with the matching label.

**As built.** Decisions taken in this slice, agreed before implementation:

- **The direction of a relation follows a rule, not the individual type**:
  `from` is the contact in whose record the fact is a property of that contact.
  `is_exclusive` is enforced per `from_contact_id`, so exclusivity then always
  reads as "this contact has at most one X" and the next exclusive type needs
  no fresh thinking. `billing_recipient` therefore points patient → payer, and
  the code is `guardian` rather than `guardian_of`, because the name must not
  contradict the direction. `parent_of` is the deliberate exception, with the
  reason written at `contact_relation_type` and in rule 4.
- **`is_exclusive` is mirrored onto the row** as `contact_relation.exclusive`,
  written only by a trigger. A partial unique index cannot read a second table,
  and exclusivity has to be a guarantee rather than a check the application
  remembers. Switching a type to exclusive rewrites its relations, so the index
  itself rejects the change when a contact already holds two — that check comes
  for free and is what makes the mirror worth having.
- **A symmetric type is stored once**, with the ends in a fixed order, so the
  same fact entered from the other side collides with
  `contact_relation_pair_key`. A directed type may exist in both directions;
  that is nonsense in content, but a constraint against it costs more than the
  case is worth.
- **`code` is fixed for every catalogue entry**, not only for system ones. It
  is the handle other rows point at, the update schemas do not carry one, and
  the foreign keys therefore need no `ON UPDATE CASCADE`. A typo is fixed by
  deleting the unused entry.
- **System entries are guarded twice**: `domain/contact-type.ts` refuses so the
  message is readable, `protect_system_type` refuses so it also holds for
  anything that goes around the domain — including clearing `is_system`, which
  would otherwise be a one-step way around the guard. `is_system` appears in no
  input schema; only the seed sets it.
- **`show_as_tab` decides prominence, not availability.** The contact list
  shows a tab per flagged role and keeps the rest in a "Weitere Rollen"
  dropdown, so no role becomes unfilterable and the bar stays short.
- **"seit" is recorded but not shown.** On the day a role is ticked, today is
  the only sensible answer, and a date field per role turned the section into a
  form of its own.
- **Relations act immediately** and do not travel in the contact's payload:
  half of a relation belongs to a record that is not being edited. Same
  reasoning as the note attachments in slice 5.
- **The old assignments `guardian`, `billing_recipient` and `other` were
  deleted** by migration 0017, agreed beforehand: the first two are relations
  now, and there is no production database.

Found while building:

- **drizzle-kit cannot see a rename without a TTY**, and non-interactively it
  errors out rather than choosing. Answering it with the default emitted
  ADD COLUMN `role_code` / DROP COLUMN `role`, which would have thrown every
  assigned role away; migration 0016 was corrected to a RENAME by hand before
  it had ever run. The foreign key to the new catalogue moved to 0017 for the
  same reason as always: it can only exist once the data is in place, and the
  snapshot describes the state after both files.

## Slice 7 — Cancellation invoices

See CLAUDE.md rule 9.

- `domain/cancel-invoice.ts`: cancellation document with negative amounts, same number range, mutual references
- PDF title "Stornorechnung" with a reference to the original number
- The freed `activity_item` rows become billable again — no replacement draft is created
- UI: cancel action on a finalized invoice, both documents visibly linked
- Tests: amounts negate the original, references on both rows, no double cancellation, items reappear in the billable list

**Done when:** cancelling produces a correct second document, leaves the original untouched apart from its reference, and returns the items to the billable pool.

**As built.** Decisions taken in this slice, agreed before implementation:

- **Both directions are stored** — `cancels_invoice_id` on the document,
  `cancelled_by_invoice_id` on the original — although either alone would do.
  The redundancy keeps every query one join deep, and it is not left to
  discipline: two partial unique indexes stop a second reference, and the
  **deferred constraint trigger** `invoice_cancellation_pair` refuses at COMMIT
  if the two ends do not name each other. Deferred is the whole point — the
  document is written before the original is updated, so during the transaction
  the pair is legitimately incomplete.
- **`cancelled` is not a status one can set.** `invoice_cancelled_state` ties it
  to the reference, so status and link move in one statement or not at all.
  Together with `invoice_draft_fields`, which demands a number and a document of
  everything that is not a draft, this also settles that a draft can never be
  cancelled — it is discarded, and leaves no gap because it never held a number.
- **The trigger was replaced, not extended.** `cancels_invoice_id` joins the
  frozen columns; `cancelled_by_invoice_id` may be written once, from null,
  never back and never to another invoice. There is no un-cancelling.
- **The same shape as `finalizeInvoice`**, and for the reason slice 6 found: a
  finished cancellation invoice cannot be written row by row, because
  `protect_finalized_invoice_line` refuses a line under anything but a draft and
  `invoice_draft_fields` refuses a draft with a number. Rows first as a draft,
  the document assembled in memory, rendered, one statement that stores and
  finalizes it. The file is written inside the transaction, with a `catch` that
  unlinks — no second path.
- **The price carries the sign, not the quantity.**
  `invoice_line_quantity_positive` forbids a negative quantity;
  `unit_price_cents` has deliberately never had a sign restriction, and
  `amount_cents` is generated from the two.
- **Intro and outro stay empty**, and no templates of their own. The original's
  outro asks for payment by a date, which is wrong on a document that takes the
  demand back. The VAT note that rule 10 puts there is the strongest case
  against copying: carrying a tax statement onto a document it was not written
  for is closer to inventing one than omitting it is. What the document does
  carry is a generated line naming the invoice it cancels — part of the
  document, like the title, and living in `messages.pdf`.
- **One number range for both document types** (rule 8), so the sequence is
  continuous across a cancellation rather than running beside it. There is no
  "Zahlbar bis" on a cancellation.
- **The slice-6 test that faked a cancellation was moved onto the real path.**
  That is what the anticipation in slice 6 was for; the billable query now
  proves itself against a document that actually exists.

## Slice 7.5 — Activity types and the status split

Inserted after 7. Three things that had been wrong since slice 4 and would have
been more expensive later: the kind of an activity was a check constraint the
practice could not maintain, one status column was carrying two different
questions, and a position had a duration nothing read. See CLAUDE.md rules 5
and 6.

- Table `activity_type`; `activity.type` becomes a composite foreign key into
  it instead of a check constraint
- `activity.status` (`planned`, `rendered`, `no_show`) beside
  `appointment.status` (`requested`, `planned`, `confirmed`, `cancelled`,
  `cancelled_late`)
- `activity_item.duration_min` dropped
- `activity.title` optional everywhere, with the type's label as the fallback
- Settings section "Vorgangsarten"; colours in the calendar; status filters on
  the Vorgänge page and in the calendar
- Seed: `initial`, `session`, `talk`, `consultation`, none of them a system
  entry

**Done when:** I can add an activity type of my own, give it a colour and a
preset, see that colour in the calendar, and record a no-show that still holds
its slot and still gets invoiced.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`readableTextOn(color)` rather than a curated palette.** Fixing white as
  the label colour fails on two of the four seeded colours — 3.7:1 on the teal
  and 3.2:1 on the amber, both under the 4.5:1 small text needs. Choosing black
  or white per colour by relative luminance never drops below 4.58:1, for *any*
  colour, which is what matters: the four seeded ones are the small problem,
  every colour picked later is the large one. The test walks the colour space
  and asserts the worst case.
- **No system entries**, unlike the two catalogues of rule 4. Nothing in the
  software depends on a particular activity type existing, so there is no
  `is_system` column and no `protect_system_type` trigger here. What cannot be
  deleted is a type that is *in use*, and the foreign key says so.
- **`ON DELETE RESTRICT` on both presets, not `SET NULL`.** A service group can
  be deleted, and a bare `SET NULL` on a composite key nulls `tenant_id` with
  it — the trap slice 4 hit on `activity.appointment_id`, which drizzle-kit
  cannot write a column list for. Refusing is also the better answer: it names
  what is in the way instead of silently emptying a preset.
- **Changing the type is not a re-pricing.** The presets are read once, when
  the type is applied. While there is nothing to overwrite the dialog draws
  them silently; the moment the activity carries a duration or positions,
  changing the type changes nothing and a line says "Dauer und Positionen
  bleiben unverändert." with a button next to it. Taking them over is an action
  with a name, and the button appends positions rather than replacing them.
- **The status split is what the exclusion constraint already implied.** A
  no-show occupies its slot; only a cancellation releases it. Once `attended`
  and `no_show` moved to the activity, the appointment's status is purely about
  the slot and the constraint's predicate did not have to change at all.
  `activity.status` gates nothing — it carries a `COMMENT` saying so, and a
  test asserts a no-show stays billable, because that column is exactly the
  kind of thing a later filter would quietly lose revenue on.
- **Rule 5 was narrowed, deliberately, and it is the one place this slice
  contradicts CLAUDE.md as written.** "No table ever stores a reference to a
  group" now reads "no row that records what happened". `activity_type.
  default_service_group_id` is a catalogue entry naming another catalogue
  entry; it is resolved into items at entry time, exactly as picking the group
  by hand is, and never travels onto an activity. The two tests that asserted
  the old wording were narrowed rather than deleted, the same way slice 4
  narrowed the service version of them, and both still fail on any *data*
  table growing a group column.
- **Filtering by status is server-side on the Vorgänge page and client-side in
  the calendar**, because that list is paged and a week is fetched whole.
- **The lossy half of the data migration touched nothing.** Mapping `attended`
  to `confirmed` and `no_show` to `planned` loses whether a slot had been
  confirmed; in the development database every appointment was `planned`, so
  zero rows were affected. Four `activity_item.duration_min` values were
  dropped with the column, all of them copies of their service's default.

Found while building:

- **The catalogue foreign key and the new check constraint cannot live in the
  generated migration.** `activity_type_fk` needs the seeded types to exist and
  `appointment_status_check` needs the old values gone, so both moved by hand
  from `0020` to `0021` before either had run — the same split as `0016`/`0017`,
  with drizzle's snapshot describing the state after both.
- The three list controls in `contact-type-settings.tsx` — order buttons,
  delete confirmation, checkbox field — were written once and copied within
  that file. A third catalogue would have made three copies, so they moved to
  `components/catalogue-controls.tsx`; the delete wording is a prop, because
  each catalogue says what happens to *its* kind of entry.

## Slice 8 — Payments and receivables

- Table `payment`
- Routes: record, list and delete payments for an invoice
- Derived status per invoice: open, partially paid, paid, overdue — computed, never stored
- UI: payment entry from the invoice and as a shortcut from the activity (which resolves to that activity's invoice), receivables overview with amount, due date, days overdue, filters
- Tests: partial payment, overpayment, due date arithmetic

**Done when:** the receivables view answers "who still owes what" at a glance.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`amount_cents <> 0`, not `> 0`.** A negative payment records a refund
  without inventing a second concept — the same reasoning that leaves
  `activity_item.unit_price_cents` free so a discount needs no mechanism. Being
  able to express a refund at all is worth more than being protected against a
  mistyped minus; zero records nothing and is always a typo. The reasoning sits
  on the constraint, in the schema and via `COMMENT ON CONSTRAINT`.
- **`overdue` is a second axis, not a status.** An invoice can be partly paid
  *and* overdue at the same time, and a sixth status would have made
  `invoicePaymentState` keep one of the two quiet. So the status is one of
  open / partially_paid / paid / overpaid / cancelled / cancellation, and
  `daysOverdue` travels beside it. The receivables view still has a "Fällig"
  button — as a filter, where the two axes do not collide.
- **Overpayment is its own status**, not `paid`. "More came in than was asked
  for" is something the practitioner has to see, and folding it into `paid`
  would hide it. The filter counts it as settled, because it is.
- **`settle` is a parameter of `finalizeInvoice`**, not a function beside it.
  It is the same transaction with two extra steps, and one of them has an order
  that is only correct in one place: the paid-variant outro has to replace the
  text **before** the render, or the stored text and the printed document
  disagree — and the PDF is never re-rendered. A missing paid-variant template
  does not stop it; the answer carries `paidTemplateUsed` so the screen can say
  the document still asks for payment, once, rather than letting that be found
  on the copy months later.
- **A draft cannot be paid**, guarded twice. It is not a claim: no number, no
  document, no date it falls due. A check constraint cannot express it because
  the status lives in a second table, so `domain/payment.ts` refuses for the
  message and the `payment_requires_finalized_invoice` trigger makes the state
  unreachable — the same shape as the mirrored `exclusive` flag in slice 6.5.
- **Cancelling leaves payments standing.** A cancelled invoice is never open,
  whatever was paid on it, and the cancellation document is not a claim either;
  both fall out of the open items through the status rule rather than through a
  `WHERE` clause, which is what makes the test worth having. Refunding is a step
  outside this software — or a negative payment on the original.
- **The receivables filter is applied in memory**, on the result of
  `invoicePaymentState`, not rewritten as SQL. A second definition of the status
  rule would eventually disagree with the first, and this view is the answer to
  "what is still open". A practice's invoices fit in memory many times over;
  when they no longer do, the fix is a materialized view, not a copy of the rule.
- **`invoice.paidCents` travels with the invoice** so a list can show the state
  without a second round trip — one grouped query in `listInvoices`, never an
  n+1, because that is the shape that eventually tempts someone to cache a total
  on the invoice row.
- **The two provisionals from slice 6 are gone**: the contact record's invoice
  block now shows what is really open and how much of it is overdue, and the
  "Zahlungen werden noch nicht erfasst" caveat and the comment above the
  function went with them.

Found while building:

- `finalizeInvoice` now answers with two things, so every caller had to change.
  The tests go through `finalizeDocument()` in `test/fixtures.ts`, which reduces
  it back to the document; only the settle tests call the real one.
- The status rule is pure and lives in `packages/shared`, which is why its test
  needs no database: eleven cases including the due-date boundary run in
  milliseconds, and the two database tests then only check that the real rows
  reach it.

## Slice 9 — Google Calendar sync

Only once everything above is in daily use. Design constraint: **Google never receives data identifying a patient.** The local database stays the system of record; Google Calendar is a projection.

- Table `google_sync_queue` (outbox), worker as a `setInterval` in the same process
- OAuth2 loopback flow (`http://127.0.0.1:PORT/oauth/callback`), refresh token stored encrypted locally
- Read: `freebusy.query` against the practitioner's private calendars, shown as busy blocks while scheduling. Intervals only, never event content.
- Write: appointments pushed to a dedicated "Praxis" calendar with the contact number as the event title, no description, no attendees, no invitations
- Limited return channel: `events.list` with `syncToken`, applying only `starts_at`, `ends_at` and `cancelled` back onto the matching `google_event_id`. Everything else ignored. Simultaneous changes on both sides mark the appointment as a sync conflict for manual resolution instead of merging.
- Works offline: a failed push never blocks creating or changing an appointment

**Done when:** appointments appear pseudonymously in Google Calendar, private blockers are visible while scheduling, and pulling the network cable breaks nothing.

**As built.** Decisions taken in this slice, agreed before implementation:

- **Pseudonymization has no exception**, not even for a contact holding no
  patient role. Two reasons, and the second is the stronger: a rule without an
  exception can be tested as an absolute — "the assembled payload contains
  nothing but the contact number, the times and one bit of status" — and *roles
  change retroactively while written events do not*. A prospect becomes a
  patient; the events that went out under their name while they were a prospect
  are still there, and the exception would need a rewrite mechanism that could
  never be complete, because the data has long since been cached on a phone.
  Both reasons stand in full at the top of `google/payload.ts`, because without
  them the file reads as needlessly awkward and gets "simplified".
- **The title is the contact number as bare digits**, no prefix. Every extra
  character is the place where somebody later just appends the activity type.
- **`calendar.freebusy`, never `calendar.readonly`.** This is the load-bearing
  line of the slice: the promise that Google learns nothing about the private
  calendars beyond *when* they are busy stops depending on our code being right
  and starts depending on the token, which cannot answer with anything else.
  The comment on the scope list names the concrete temptation ("otherwise we
  cannot show the calendar names") and its answer
  (`calendar.calendarlist.readonly` shows names and no content). No identity
  scope either — `openid email` was in the list until it was noticed that the
  primary calendar's id *is* the account address, so it bought a second consent
  line for data already in hand. `google/oauth.test.ts` asserts the list
  exactly, because a promise that lives only in a comment is one refactor away
  from being gone.
- **`upsert` / `delete`, not create/update/delete.** The state of the
  appointment *at push time* decides, not the one at enqueue time, so three
  edits in a row are one call. A released slot goes out as a cancelled event
  rather than a deletion: the time is free in Google either way, the id stays
  valid, and reviving is an ordinary update.
- **The event id is derived from the appointment id** (base32hex of the UUID).
  A lost answer after a successful insert would otherwise duplicate the event —
  and it would do so precisely when the line is bad, the most probable failure.
  The retry now runs into a 409, which counts as success.
- **Conflicts are their own table**, not three columns on `appointment`. A
  conflict has its own time and its own reason, it is resolved by being
  deleted, and the list is then a plain select. It sits in the **calendar**,
  not in the settings: a conflict is a scheduling fact. The settings say
  whether the sync works.
- **`calendar_id` is frozen on the queue row.** Without it, changing the
  practice calendar would send a pending deletion to the wrong calendar and
  leave the event standing in the old one.
- **Disconnecting asks** what should happen to the events in Google, with
  "leave them" as the default, and names afterwards — with date and time — the
  ones it could not delete, so they can be found by hand. The local cleanup is
  identical either way and total: queue, conflicts, `google_event_id`,
  `google_etag`, `last_pushed_at` and the connection row all go.
- **No `googleapis` package.** It is enormous and brings its own auth stack for
  seven calls. The transport is a parameter, which is what lets every test in
  this slice run offline and assert on the *request* rather than on what a mock
  chose to answer.
- **A key mismatch is named, not swallowed.** `key_fingerprint` is checked
  before decrypting, so a changed key produces a sentence rather
  than a GCM tag failure — and nothing is deleted automatically, because a key
  set wrongly by accident must not throw a working connection away.

Found while building:

- The OAuth callback cannot be authenticated by session: `127.0.0.1:3000` and
  `localhost:3000` are different origins, so the cookie is not sent at all. It
  authenticates through the single-use `state` instead, which is the correct
  shape for a loopback flow anyway, and answers with a plain page rather than
  redirecting into an SPA that is not on that origin.
- `updateAppointment` had to become transactional. Enqueuing outside the
  transaction that moves the slot would leave an instruction behind for a move
  that rolled back.
- drizzle-kit generated the two composite foreign keys *before* the
  `appointment (id, tenant_id)` unique key they point at. Reordered by hand in
  `0024`, with a note saying so at the top.
- The calendar's block geometry became one function. An all-day blocker from a
  private calendar starts at 00:00 and painted above the grid; the clamp now
  covers appointments too, which had the same bug for anything before 07:00.

## Slice 10 — Sending invoices by email

Purely additive; nothing earlier depends on it.

- SMTP configuration in the practice settings
- `sent_at`, `sent_to` on the invoice, plus a small send log
- Send the finalized PDF as an attachment to the contact's email address, with a configurable subject and body template
- Sending is never automatic and never part of finalization

Settled before the slice starts (CLAUDE.md rule 14):

- **The SMTP transport is a parameter**, the shape slice 9 established for the
  Google API handle. No test opens a connection — not to a server, not to a
  mail catcher, not to `localhost`. The tests assert the assembled message:
  recipient, subject, body, attachment and its file name.
- **The test send goes to the configured sender address and nowhere else.** No
  recipient field on the form, no recipient in the request body — the address
  is read from the practice settings. A button that exists to check the
  configuration must not be a way to send an invoice somewhere by accident.
- Addresses in tests, fixtures and seeds are `praxi.invalid`.

**Done when:** I can send a finalized invoice from the app and see when it went where.

**As built.** Decisions taken in this slice, agreed before implementation:

- **Synchronous, no outbox** — the deliberate opposite of slice 9. The
  difference is not the feedback but what a retry *means*: the Google push
  projects a fact that already stands locally, so repeating it is free and a
  timer may decide. A mail is an act. An automatic retry may deliver twice with
  nobody able to tell, SMTP does not reliably separate greylisting from a hard
  refusal, and a background attempt succeeding two hours later leaves the
  practitioner believing it failed. What replaces the retry mechanism is that
  every attempt is logged, failures included, **written before the caller hears
  anything** — a client that navigates away loses only its answer.
- **No `sent_at` / `sent_to` on the invoice.** The original spec asked for
  them; derived from `invoice_send` instead, one grouped query like
  `paidCents`. The log already knows, a second place would eventually disagree,
  and columns there would have meant widening the allowlist of
  `protect_finalized_invoice` — so the slice stays genuinely additive.
- **`smtp_settings` is its own table**, not columns on `practice_settings`.
  `updatePracticeSettings` writes the whole form object with `.set(input)`, so
  a password living there would travel to the client and back on every save of
  the master data. Apart, "the settings response carries no secret" is a
  property of the shape rather than something to remember.
- **`email_template` is its own table**, not two new values in
  `text_template_kind`. A subject and a body are one message; two independent
  rows of a generic table could be picked apart into a state that means
  nothing. `text_template` and its enum stay untouched.
- **`buildTestMail()` takes no recipient.** The safeguard from rule 14 written
  as a signature rather than as a rule to remember — there is nowhere to pass
  an address, and the test asserts the arity.
- **nodemailer**, against the hand-written client of slice 9. The line is where
  the risk changes: seven JSON calls over HTTPS are worth writing yourself, a
  stateful line protocol with a STARTTLS upgrade, SASL, dot-stuffing, MIME
  boundaries and RFC 2047 header encoding is not — and MIME assembled wrongly
  is discovered at the recipient. It has no runtime dependencies and sits
  behind `MailTransport`, so `domain/` never sees it.
- **`logger: false, debug: false` explicitly.** Left at its default nodemailer
  writes the SMTP dialogue to stdout, `RCPT TO:` included, and that address
  identifies a patient. Our own log line is an invoice id and an outcome; the
  recipient, the subject and the raw error live in `invoice_send`, which is a
  record in the protected database and not a log.
- **Placeholders resolved once**, when the dialog is prepared, so screen and
  message cannot differ. Unknown ones stay standing rather than being emptied,
  and both the server and the dialog name them — the dialog re-scans on every
  keystroke, because the text is editable and one can be typed in by hand.
- **`GOOGLE_TOKEN_KEY` → `ENCRYPTION_KEY`**, and `google/crypto.ts` →
  `src/secrets.ts`. It is not Google's any more, and a second copy for mail
  would have been the beginning of two mechanisms that drift. No alias and no
  fallback: two names for one thing is ballast whose reason nobody remembers in
  a year. The name went through `SECRET_KEY` first and was corrected in the
  same slice — the value is the key things are encrypted *with*, not a secret
  being protected, and "secret key" leaves that open in a way that invites a
  real password to be pasted there. `.env.example` says so in full.

Found while building:

- The tests needed an `ENCRYPTION_KEY` to assert that the password is stored
  encrypted. Set to a fixed obviously-fake value in `src/test/setup.ts` —
  encryption is arithmetic, not a service, so this needs nothing running and
  breaks no rule about network calls.
- The one non-additive change in the slice is that move of the secret store.
  Everything else is new tables, new files and two derived fields.

## After slice 10 — four corrections

No schema, no migration, no domain change. Recorded because two of them
overturn an earlier decision and one is a finding nobody can see by reading.

- **The invoice draft opens in read mode**, like every other detail view. The
  slice-6 exception — "a draft is not a record to read" — was mine and did not
  hold up in daily use. Two things fell out with it: the preview, which renders
  what is *stored* and therefore came out empty on an unsaved draft, is now
  offered in read mode only, where the screen and the database cannot differ;
  and `saveThenFinalize` is gone. That detour existed solely because the two
  could differ, and it had to swallow the success message of its own save so it
  would not sit next to a failed finalization. One special path removed by a
  step that was owed anyway.
- **"Neue Rechnung" in the invoice list**, not only from a contact's record.
  The only thing missing on that way is the recipient, so the dialog asks for
  exactly that and reuses `ContactPicker`; same call, same landing place.
- **`ReadModeFieldset` replaces the plain `<fieldset disabled>`.** The finding:
  a disabled fieldset disables its form controls, and what that suppresses is
  the **click** — but Radix' `Select` opens on `pointerdown`, which is still
  delivered to a disabled control. Nine dropdowns in seven dialogs looked
  disabled, were not focusable, and still opened and accepted a choice that was
  then never saved. A dropdown that silently does nothing is bad; one that says
  something was changed and drops it is worse. The state now lives in a context
  that `ui/select.tsx` reads. Nine explicit `disabled` attributes would have
  been a rule to remember at the tenth dropdown; this is a property of the
  component. Popover, Checkbox and Tabs were checked and need nothing — they
  act on click or mousedown. `DropdownMenu` and combobox primitives would need
  the same context and are not used anywhere yet.
- **Links stay reachable inside a read-mode fieldset.** Downloading a file from
  a locked note in read mode is right, and the rule it stands for is the one to
  apply to any new control: reading is allowed in read mode. Anything that
  changes the record belongs inside the fieldset.

## After slice 10 — forms that claimed a state

One reported symptom, one audit, one rule.

- **The number range settings prefilled a range that did not exist** — a
  plausible prefix, four digits, next value 1, and a preview reading
  `2026-0001`. It was believed, and the missing range surfaced on finalizing.
  Now: empty fields, a visible "Noch nicht angelegt", a button that says
  "Nummernkreis anlegen", and no preview until there is something to preview.
  The two numbers are held as text, because a `type="number"` input cannot be
  empty without falling back to a value the range does not have.
- **The contact range says that it creates itself.** Without that sentence
  "noch nicht angelegt" reads as a task and one creates it by hand — which is
  precisely what the whitelist in `domain/counter.ts` exists to make
  unnecessary. Still no seed for the invoice range: a silent start at 1 would
  reissue numbers from the previous system.
- **The letterhead card was the same mistake in the other disguise.**
  "Briefbogen anzeigen" stood there unconditionally and answered 404 when none
  was uploaded — the client had no way to know, because `invoice_template_path`
  reached no response. Now `GET /api/settings` carries the derived
  `invoiceTemplateSet`, and `GET /api/settings/invoice-template/pages` answers
  how many pages it has, so one-page against two-page stays readable without
  uploading again. The path itself still never leaves the server.
- Audited alongside and found clean, each for its own reason: Google (nothing
  is rendered until `connected`), the practice master data (the row always
  exists; a missing one is a 404, not a blank form), and every catalogue —
  text blocks, mail templates, roles, relations, activity types — where a form
  appears only after "Neu" and is titled "anlegen". SMTP was left untouched: it
  shows empty fields and says "Noch nicht eingerichtet", and port 587 in a
  visibly empty form is a suggestion, not a claim.
- The rule this leaves behind is in CLAUDE.md beside *read mode first*: **a
  form never claims a state that does not exist** — neither through prefilled
  values nor through a control that leads nowhere. Same family, same reason.
  Read mode keeps a screen from changing a record by accident; this keeps it
  from inventing one.

## After slice 10 — dates in the application's own format

The native date fields followed the *browser's* language: an en-US machine
asked for mm/dd/yyyy under German labels, and the `datetime-local` on the
activity offered a twelve-hour clock with AM/PM.

- **`packages/shared/src/date-format.ts`** holds one descriptor — order,
  separator, notation — and `parseDateDE` / `formatDateDE` / `parseTimeDE` /
  `formatTimeDE` are written against it rather than naming a format themselves.
  A later translation adds a second descriptor and chooses it there; no field
  is touched. The `Intl` formatters in `datetime.ts` read the locale from the
  same module, so display and input cannot drift apart.
- **Tolerant reading, one strictness.** `13.7.26`, `13/7/2026` and `130726` are
  the same day; `9:5`, `930` and `9.30` are times. But `31.02.2026` is `null`
  and never the third of March — the same round-trip check `parseLocal` already
  used, for the same reason: a date that rolled over silently is worse than one
  that was refused.
- **Two-digit years and the date of birth.** 00–69 is this century, 70–99 the
  last — right everywhere except the one field that reaches far enough back for
  it to be wrong rather than harmless. `12.3.46` for a patient born in 1946
  would become 2046 and their age would be wrong from then on, so that field
  alone passes `twoDigitYear: 'past'`. A four-digit year is never
  reinterpreted, in any field.
- **The calendar is hand-written**, and month and year are dropdowns rather
  than something to page to. Entering a date of birth means travelling eight
  hundred months. Written this way it is the only shape the component has, not
  an option somebody has to switch on — the same argument as everywhere else in
  this repository. No new dependency; it is date arithmetic, not a protocol.
- **The screen and the value never disagree**, which is the rule from the
  previous commit applied to a field: every keystroke is parsed and reported,
  and unreadable text emits an empty string rather than leaving the previous
  date standing behind a field that no longer shows it. The complaint waits for
  the field to be left, because marking half-typed input as wrong is noise.
- Replaced: date of birth, note date, payment date, invoice date, date of
  service per invoice line, the two filters on the activity list, and the
  activity's date and time — that last one split into two fields, which is what
  removed the AM/PM clock.

## Slice 10.5 — contact fields for a person, and the address split

Migration `0028_contact_person_fields`. Everything added is optional; nothing
became `NOT NULL`.

- **`gender`**, `text` with the named check `contact_gender_values`, values
  `female | male | diverse` — the three entries German civil status law knows
  since 2018. There is deliberately no `unspecified`: "no entry" is the fourth
  state the law has and it is already `NULL`, so a value beside it would be a
  second way of saying almost the same thing and the two would drift. The
  German labels live in `strings.ts` and are never derived from the value.
- **The salutation is not derived from it and will not be.** "Familie" and
  "Herr und Frau" have to stay possible, so it remains free text in its own
  column. Said in the schema, in the migration's `COMMENT` and in the Zod
  schema, because this is exactly the shortcut somebody takes later.
- **`birth_place`**, and both are person fields: `contact_kind_fields` was
  replaced (DROP/ADD in one migration) so an organization must have them
  `NULL`, like the salutation and the date of birth.
- **`house_number` is its own column.** The address line is assembled by
  `formatStreetLine()` in `packages/shared`, the same function on screen and in
  the invoice PDF — the argument of `formatContactName()` one field further: a
  document has to read like what was checked before it was issued.
- **`recipient_snapshot` gained a nullable `houseNumber`**, and the test that
  covers it is about the model, not about old data: a snapshot holds what the
  contact looked like at finalization, so every field the contact schema grows
  afterwards is a key older snapshots do not have. Reading one has to produce
  the document it produced that day. This does not stop being true after go-
  live, and the test says so in as many words so it is not narrowed to a
  null-check during some cleanup.
- **`phone` became `phone_mobile` and `phone_landline`**, with nothing carried
  over — the development database held no phone number at all, and until go-
  live a row that no longer fits a schema change is deleted rather than nursed
  along in a migration.
- `meta/0028_snapshot.json` is hand-written beside the migration, derived from
  0026. drizzle-kit cannot generate the `phone` split without an interactive
  answer to "renamed or dropped", and without a snapshot the next `generate`
  would emit these columns a second time. `drizzle-kit generate` now reports no
  drift.

Checked and unchanged: the contact list shows only the city, the search covers
first, last and company name and the contact number but never a phone number,
and the mail send resolves an email address alone.

## Slice 11 — billing from the activity

No schema change and no migration: everything here was already derivable, and
a stored "billed" flag would be the second place that eventually disagrees
with the invoice lines — the argument of `paidCents` in slice 8.

- **One operation, two ways in.** `collectBillableItems()` turns billable items
  into drafts, one per contact, appending to the draft a contact already has
  instead of opening a second one. The button on an activity and the bulk
  action on the new list are the same call with a different number of ids, so
  the rule lives in `domain/` and not in two screens. All contacts in one
  transaction. Both ways confirm what will happen — new draft or addition —
  worked out from the drafts the screen has loaded anyway, so there is no
  preview endpoint.
- **`activity.billingState`** — `none | open | billed`, derived on read, never
  stored. `none` means there is nothing to bill, not that nothing has been
  billed.
- **The cancellation test is the one that matters.** It protects that
  `billingStateOf` and `listBillableItems` decide with the *same* condition:
  cancelling an invoice frees its items, so an activity falls back from
  `billed` to `open` with nothing kept in step. Implement `billingState` more
  conveniently later — a column, a flag written at finalization, a query that
  only asks whether any line exists — and every easy case still passes while
  this one falls over. The test says so in its own comment so it is not
  relaxed by someone who reads it as a nullable-edge-case.
- **Abrechenbar is its own navigation entry**, between Vorgänge and Rechnungen.
  The three make one path: **Abrechenbar → Rechnungen → Bezahlübersicht** —
  work done and not yet demanded, demanded, demanded and not yet paid. Not a
  tab in the invoice list, which lists invoices and would promise the same
  entity in another selection; not a tab in the activity list, which is the
  documentation of what happened while this is a money view with a creating
  action.
- **The status is shown and cannot be filtered on.** `billableQuerySchema` has
  no status field, so it is not a rule anybody has to keep — it is not
  expressible. The comment on `listBillableItems` used to say the status must
  not be in the result at all; it now says why there is no parameter, which is
  what the code actually does.
- The `loadActivity` billing query makes the activity list an N+1. It has been
  one since slice 4 (items and appointment are loaded per row too) and the
  comment says the fourth query is deliberate, so it is not read as an
  oversight later. When the list is felt to be slow, all four go at once.

## After slice 11 — two faults in the send dialog

- **The send button hung on the contact, not on the field.** `canSend` was
  false when the contact had no address, so typing one in changed nothing:
  the button stayed disabled and the red hint stayed up. `blockedReason` now
  covers only what typing cannot mend — a draft invoice, no SMTP account — and
  what the *prefill* could not supply travels as `recipientAddressMissing` and
  `templateMissing`, which the screen stops honouring as soon as the field
  holds something. The button's own condition is the current field contents,
  validated with the very schema the send endpoint validates with, so the two
  cannot disagree about what an address is.
- It is the same family as "a form never claims a state that does not exist",
  from the other side: here it kept claiming one that no longer did. Audited
  the rest — every other disabled button and warning is either derived from
  form state already (`NumberRangeForm`, the activity dialog, the payment
  dialog, the contact form) or from loaded data that the form genuinely cannot
  change (a number range that is not configured, a Google calendar we may not
  write to, a system role that cannot be deleted, a contact kind that is
  fixed). The send dialog was the only one.
- **The covering note can be chosen.** A select over the active templates,
  preset to the one in force and shown even when there is only one, so which
  note applies is readable rather than guessed. Switching **prepares the draft
  again on the server** — placeholders keep being resolved by one resolver
  before the text is shown, never in the browser and never at send time (rule
  14). A template that has meanwhile been deleted falls back to the default
  rather than turning the dialog into a 404, and the answer says which one was
  used.
- Text the practitioner has already edited is **not** overwritten by a switch.
  It says so and offers taking it over, the same shape as applying an activity
  type's presets. "Has this been edited" is a ref set by the change handlers,
  not a comparison after the fact — an effect that read the fields it writes
  would fight with typing.

## Slice 11 — Deployment via Coolify

Infrastructure only — no schema, no domain rule, no UI. Gets praxi running on
a netcup root server through a self-hosted Coolify instance, deployed
straight from this GitHub repository. Coolify builds the `Dockerfile` at the
repository root and brings its own reverse proxy and TLS; Postgres is a
separate Coolify database resource, not part of any application-level
compose file. `DEPLOY.md` holds the step-by-step path from an empty server to
a running instance.

Explicitly out of scope, as instructed before planning: multi-tenancy, RLS,
registration, rate limiting, backups — all separate, most of them already
tracked under "Before going live" below.

**As built.** Decisions taken in this slice, agreed before implementation:

- **Multi-stage `Dockerfile`**, `node:24-alpine`, running as the image's
  built-in `node` user rather than root. A `deps` stage installs the full
  workspace including devDependencies for building; a separate `prod-deps`
  stage runs `pnpm install --prod --frozen-lockfile --filter @praxi/server...`
  so the runtime image only ever contains `@praxi/server`'s and
  `@praxi/shared`'s production dependencies — `apps/web` needs no runtime
  footprint at all, its build output is the static files already written
  into `apps/server/public`. Considered `pnpm deploy` for this and rejected
  it: without a `"files"` field it packs by the same rules as `npm pack`,
  which falls back to `.gitignore` — and `dist/` and `public/` are both
  gitignored, so `pnpm deploy` would silently ship an image without its own
  build output.
- **Migrations run as the first step of the container's own start sequence**
  (`CMD` chains `node apps/server/dist/db/migrate.js && exec node
  apps/server/dist/index.js`), not through Coolify's pre- or
  post-deployment command hooks. Read from Coolify's own source
  (`ApplicationDeploymentJob.php`) before deciding: the pre-deployment hook
  execs into the *previous* container before the new image is even built —
  skipped entirely on a first deployment, and on any later one it would run
  against the *old* code's migration files, never the new ones. The
  post-deployment hook does run in the new container, but only after
  traffic has already switched to it and the deployment is already marked
  finished; a failing command there is caught and only logged as a warning.
  Neither gives "run with the new code, before it takes traffic, and hard-fail
  the deployment if it doesn't apply" — the container's own startup does, for
  free, through the health check Coolify already gates traffic-switching on.
  `apps/server/src/db/migrate.ts` calls `drizzle-orm`'s own
  `postgres-js/migrator` programmatically rather than shelling out to
  `drizzle-kit migrate`, so `drizzle-kit` never has to be a production
  dependency for the sake of one function `drizzle-orm` already exports.
- **`ENCRYPTION_KEY` is generated once on the server and never reused from
  local `.env`, and never regenerated on a later redeploy** — losing it
  makes the stored Google refresh token and SMTP password permanently
  undecryptable with the new key. Documented as its own section in
  `DEPLOY.md`, not just a table row, because "regenerate all secrets on
  redeploy" is a reasonable habit from other projects that would quietly
  break this one.
- **A new Google OAuth client of type Web application**, alongside the
  existing local Desktop client rather than replacing it. No code change —
  `google/oauth.ts` already takes `redirect_uri` from the
  `GOOGLE_REDIRECT_URI` environment variable — but a Desktop client only
  ever accepts a loopback redirect, so it cannot be pointed at a public
  HTTPS URL at all; only a Web client with that URI registered in "Authorized
  redirect URIs" works.
- **`GET /api/health` stays exactly as it is** — no database round-trip
  added for Coolify's check. `verifyDatabaseConnection()` already fails the
  process at startup when Postgres is unreachable (`index.ts`), so a
  per-request DB check on the health path would repeat that same guarantee,
  potentially every few seconds, for no new information.
- **Postgres runs as Coolify's standard managed database resource**, not a
  custom container — confirmed against Coolify's source
  (`StandalonePostgresql`) that an arbitrary `POSTGRES_INITDB_ARGS`
  environment variable is honoured on that resource, the same mechanism
  `docker-compose.yml` already uses locally for
  `--locale-provider=icu --icu-locale=de-DE`. Only takes effect on an empty
  data directory, so it has to be set before the very first start.
- **Squashing the migration history into a `pg_dump` baseline stays
  deferred**, moved into "Before going live" below rather than done in this
  slice. This deployment is the infrastructure step, not the point at which
  real patient data starts flowing through the system — that gate already
  has its own, still-open checklist, and squashing is a one-way door
  (history becomes unreconstructable) with no benefit before then.
- Verified locally before anything touched the server: `docker build`, then
  `docker run` against the local Postgres — migration applied cleanly (29
  migrations), `/api/health` answered 200, the Docker `HEALTHCHECK` turned
  healthy, the container ran as `node` rather than root, `DATA_DIR` was
  writable, and `SIGTERM` reached the server directly (`exec` in the `CMD`
  chain hands it PID 1) for a clean shutdown instead of the default
  10-second kill timeout.

## Slice 12 — Theme mechanism and user preferences

From a design pass: five theme variants (schiefer, blau, salbei, rose,
nacht), switched via `data-theme` on `<html>`, plus the infrastructure for
user preferences in general — the theme is the first one, a per-view column
list is a plausible later one. Colour values themselves came from the design
file and were deliberately not reviewed or corrected in this slice; only the
mechanism was built.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`app_user.preferences jsonb not null default '{}'`**, plus
  `check (jsonb_typeof(preferences) = 'object')`, rather than a column per
  preference or a `user_preference(key, value)` table. A column per
  preference costs a migration and a wider table for every future one; a
  key-value table loses the one-Zod-schema-per-entity shape a structured
  value (a per-view column list) needs. Same reasoning as
  `invoice.recipient_snapshot`: every key optional with a default, so the
  schema can grow without a migration. Explicitly **not** in
  `practice_settings` — a preference of the user, not a property of the
  practice.
- **Reads and writes share one Zod schema**
  (`packages/shared/src/user-preferences.ts`, `userPreferencesSchema`,
  `themeOptions`): every key is optional by nature, so a `PATCH` body and a
  `GET` response have the same shape. Unknown keys are dropped on parse,
  which is what lets an older client read a blob a newer one already added a
  key to.
- **`updateUserPreferences` merges with Postgres's own `jsonb || jsonb`** in
  one `UPDATE ... RETURNING`, never a read-then-write of the whole object.
  This is the one thing not to "simplify" later: preferences are saved from
  different, unrelated screens, each knowing only its own key, and a plain
  `set({ preferences: input })` would let a save from a client that has never
  heard of a later key erase it. Covered by a test that seeds a key the
  current schema does not know and confirms it survives an ordinary save.
- **No flash on load.** `ThemePicker` applies the resolved theme to
  `document.documentElement.dataset.theme` and mirrors it to
  `localStorage['praxi-theme']`. A small inline, non-module `<script>` in
  `index.html` — before the app even starts loading — reads that cache
  synchronously and applies it, so a returning visitor never sees the
  default (schiefer) before their real theme takes over. The valid-theme
  list is necessarily duplicated there (nothing can be imported that early);
  the comment says so and points at `themeOptions` as the source of truth.
  Absent a cache — first visit, a different browser — it stays on the
  default rather than guessing.
- **`--sidebar` / `--sidebar-foreground` wired into `@theme inline`.**
  `_app.tsx`'s `bg-sidebar` (slice 1) had never had a matching
  `--color-sidebar` in any `tokens.css` — the class was silently a no-op.
  The new tokens file finally defines the token; found and fixed as part of
  making it take effect, same family as the `--font-sans` wiring gap from
  the previous slice.
- **Tailwind's own dark-mode mechanism removed**, not just left dormant:
  `@custom-variant dark (&:is(.dark *))`, the dead `.dark { … }` value block
  in `styles.css`, and every `dark:`-prefixed utility across the seven
  shadcn primitives that had one (badge, button, checkbox, input, select,
  tabs, textarea). Checked first, not assumed: `dark:` classes were
  genuinely present, dozens of them. Deleting only the `@custom-variant`
  line would **not** have made them inert — Tailwind v4 falls back to its
  built-in meaning for `dark:`, `@media (prefers-color-scheme: dark)`, which
  would have started applying those styles based on the visitor's OS setting
  alone, independent of the chosen `data-theme`. Removing the utility
  classes themselves was the only way to actually retire the mechanism.
- **`praxi-tokens.css` arrived with broken character encoding** (UTF-8 read
  as Latin-1) and the word "praxi" in its own header comment. Re-transcribed
  with the exact same wording and values, correctly encoded, product name
  dropped from the file (the `localStorage` key `praxi-theme` keeps it — that
  prefix protects against collisions and was kept on purpose). Two comments
  that had gone stale relative to what was actually built in this same slice
  were corrected, not just re-encoded: "kommt aus den Praxis-Einstellungen"
  (it comes from `app_user.preferences`, decided in this slice, not
  `practice_settings`) and the font comment's mention of a Google Fonts
  preview link (this file ships the real, self-hosted `@font-face` rules,
  not a preview stand-in).
- **Font**: reused the two variable-font files already vendored in the
  previous slice (`source-sans-3-latin.woff2` / `-latin-ext.woff2`,
  weight axis 400–600) rather than downloading anything new. Confirmed
  first that this still covers what the app actually uses — `grep` across
  `apps/web/src` for Tailwind's `font-*` weight utilities turned up only
  `font-normal` (400), `font-medium` (500) and `font-semibold` (600), never
  `font-bold` — and a variable font's declared 400–600 range covers 500 by
  interpolation, so no third file was needed.
- **Verified in a real browser**, not just by reading the generated CSS:
  Playwright against the dev server confirmed the picker's five swatches
  (each a `data-theme`-scoped span reading the real `--primary`, not a
  second colour list in TypeScript), an immediate full recolour on switching
  to `nacht`, `document.documentElement.dataset.theme` already `"nacht"`
  at the moment the reload's navigation resolves (the actual no-flash
  proof, not just "looks fine on screenshot"), and the `--sidebar` fix
  visible as a now-distinct sidebar tone in the default theme.

## Design-Korrektur 2 — 01 Kalender

Die Vorlagen dieser Runde sind Bilder, nicht Prosa: `docs/design-korrektur-2/
01 - Kalender/Desired Screens/`. Sie stehen laut Vorgabe **über** dem
Handoff-Prototyp, über `docs/design-abgleich/` und über den Paketen K1–K10.
Wo eine frühere Entscheidung ihnen widerspricht, ist sie überstimmt — was in
diesem Bildschirm dreimal vorkommt und dort jeweils vermerkt ist. Vier Pakete,
in dieser Reihenfolge:

1. **K1 — Schema und Domäne** (erledigt, Migration `0034`)
2. **K2 — Layout** (erledigt)
3. **K3 — Panels** (erledigt)
4. **K4 — Ansichten** (erledigt)

**K1, as built.** Vor der Umsetzung entschieden:

- **Der Termin steht für sich.** `appointment.contact_id` ist nullable,
  `activity.contact_id` bleibt `not null`. Regel 6 in `CLAUDE.md` ist
  entsprechend fortgeschrieben; die Folge, dass ein Termin ohne Kontakt
  nachträglich keinen Vorgang mehr aufnehmen kann, steht dort als Absicht.
- **Der Überschneidungsschutz ist weg.** `appointment_no_overlap` gelöscht,
  weil eine Doppelbelegung eine Entscheidung ist und ein Constraint sich im
  entscheidenden Moment nicht überstimmen lässt. `findFreeSlots` schlägt
  belegte Zeiten weiterhin nicht vor — das ist die einzige Stelle, an der eine
  Überschneidung *vorgeschlagen* statt gewählt würde.
- **Eine Route statt `/move`:** `POST /api/appointments`,
  `PATCH /api/appointments/:id`, `DELETE /api/appointments/:id`. Das Ziehen im
  Raster schickt nur die zwei Zeitpunkte durch dasselbe PATCH.
- **Löschen nur ohne Vorgang.** Ein versehentlich angelegter Blocker muss
  verschwinden; „Absagen" wäre dafür falsch, er bliebe als abgesagter Termin
  stehen und zählte in der Absagen-Zahl mit. Wo ein Vorgang hängt, ist Absagen
  die richtige Geste, und `deleteAppointment` verweigert mit einem Satz.
- **Google:** ein Termin ohne Kontakt hat keine Kontaktnummer; statt ihrer geht
  die Konstante „Belegt" hinaus, nie der selbst getippte Titel (Regel 13).
- **Konfliktart `overlap` entfällt**, Check auf `both_changed` verengt, der tote
  Zweig im Rückkanal gelöscht.

**K2, as built.** Drei Spalten: links 238 px mit „Neuer Termin", Minimonat und
Terminfinder (`components/calendar-sidebar.tsx`, neu), in der Mitte das Raster,
rechts 320 px Tagesüberblick (`calendar-rail.tsx`, auf das Antworten
reduziert). Damit ist die K10-Entscheidung „zwei Spalten statt drei" aus
`docs/design-korrektur/abweichungen.md` überstimmt; der Eintrag dort bleibt als
Protokoll stehen, gilt aber nicht mehr.

- **Raster**: Halbstundenlinien (`--border` auf 45 %), graue Fläche außerhalb
  der Öffnungszeiten (`--muted` auf 55 %, rein optisch — dort lässt sich
  weiterhin ein Termin anlegen, nur der Finder hält sich an die Zeiten), Start
  bei 08:00, Heute-Ton auf Kopf (8 %) und Spalte (3 %).
- **Block**: Hauptzeile ist die Bezeichnung, ersatzweise der Kontaktname
  (`lib/calendar-entry.ts`); darunter die Art, bei abgesagt oder angefragt
  stattdessen der Terminstatus. Der *Vorgangs*status steht nicht mehr dort — er
  hatte die Art verdrängt, und damit stand in einer vergangenen Woche überall
  „Stattgefunden" statt dessen, wofür die Spalte gelesen wird. Füllung 20 % der
  Artfarbe, 9 % bei angefragt, 12 % bei einem Termin ohne Vorgang.
- **Minimonat**: drei Marken statt zwei — heute gefüllt, gewählter Tag auf
  20 % Primary, die sichtbare Woche als `--accent`-Band.
- **Terminfinder**: fest in der linken Leiste statt als Modus, ohne
  Ergebnisliste (die Treffer stehen im Raster), mit Erklärsatz und „Auswahl
  aufheben". Ein zweiter Klick auf denselben Eintrag hebt die Auswahl auf. Beim
  Klick auf eine freie Zeit **bleibt die Suche stehen** — sie endet erst mit dem
  angelegten Termin; vorher kostete ein Fehlklick die ganze Antwort.
- **Tagesüberblick**: „Nächste freie Zeit" neutral statt primary-getönt, und
  die Ablaufliste zeigt die Dauer statt der Art.
- **Rollbalken** produktweit dünn, Daumen `--border`, 8 px (`styles.css`).
- **Nicht umgesetzt, auf Ansage:** schmalere Wochenendspalten (L1). Alle Tage
  sind gleich breit.
- **Nachgemessen statt übernommen:** die Zeilenhöhe. Der Vorschlag von 36 px
  pro halber Stunde ging mit der Messung zurück — die Bilder zeigen 44 px
  (Tagesansicht 56), und bei 36 verliert ein 45-Minuten-Block seine dritte
  Zeile. Bleibt bei 44/56.

**K3, as built.** Das Panel in der rechten Leiste bekommt einen Kopf (Art,
Name, Tag und Spanne), zwei Reiter für einen neuen Eintrag und eine klebende
Fußzeile.

- **Ein Vorgangsformular, nicht zwei.** `ActivityForm` wird im Kalender
  weiterverwendet (V6) und hat dafür vier Zugänge bekommen: `submitLabel`,
  `footerPortal` (die Aktionszeile rendert per Portal in die Fußzeile des
  Panels, die außerhalb des scrollenden Bereichs liegt), `warning` und
  `onDraftChange`. Dazu `appointmentFixed`, weil im Kalender der Reiter
  entscheidet, ob ein Termin dazugehört. Es ist dasselbe Formular mit anderem
  Rahmen — keine reduzierte Fassung.
- **„Nur Termin" ist ein eigenes Formular** (`appointment-form.tsx`), und das
  ist die umgekehrte Entscheidung zum Absatz darüber: kein Typ, keine
  Positionen, keine Abrechnung, keine Kontaktpflicht — vier von fünf
  Abschnitten hätten abgeschaltet werden müssen. Es hat ein Feld
  „Bezeichnung", das Bild 06 fehlt; ohne es hätte ein Blocker im Raster keinen
  Namen.
- **Leistungspicker** (`service-picker.tsx`, Bild 14): eine Auswahl mit den
  Überschriften „Leistungen" und „Leistungsgruppen" statt zweier Dropdowns
  nebeneinander. Die Gruppe wird beim Picken sofort aufgelöst (Regel 5).
  Eingesetzt nur im Kalender; Rechnungspositionen und die Vorbelegung der
  Vorgangsart behalten ihre Steuerung, bis ihre Bildschirme drankommen.
- **Absagen und Löschen** getrennt: am Vorgangstermin nur „Absagen", am reinen
  Termin „Löschen" links und „Absagen" rechts (`appointment-detail.tsx`).
- **Überschneidungswarnung** nach Bild 13: der Entwurfsblock im Raster folgt
  den Feldern und wird bei Kollision destructive gezeichnet, im Panel steht der
  Satz. Nichts verweigert das Speichern. Die Zeilen des Blocks sind nach Rang
  vergeben statt gestapelt — eine halbe Stunde ist 44 px hoch und trägt drei
  Zeilen, und abgeschnitten wurde ausgerechnet die Warnung.
- **Kontaktsuche startet geschlossen** (V10): sie zeigte vorher das ganze
  Adressbuch, was in einer 320-px-Leiste jedes Feld darunter vom Schirm schob.
- **Nicht angefasst, auf Entscheidung:** die Feldreihenfolge im Lesemodus nach
  Bild 11. `ActivityDetail` bedient drei Container, und Bild 11 gibt nur den
  Kalender vor — die gemeinsame Form wird gesucht, wenn Vorgänge und
  Kontaktakte an der Reihe sind.

**K4, as built.** Fünf Ansichten statt drei. Monat und Liste sind nicht das
Raster mit anderen Zahlen — sie beantworten andere Fragen und zeichnen deshalb
nichts maßstäblich; geteilt werden nur die Einträge und was ein Klick auslöst.

- **Monat** (`calendar-month.tsx`): sechs volle Wochen, damit ein Tag beim
  Blättern nie die Zeile wechselt. Je Zelle drei Einträge und „+ N weitere";
  heute als gefüllter Kreis auf der Zahl, Tage außerhalb des Monats gedämpft.
  Ein Klick auf die Zahl oder auf „+ N weitere" führt in die Tagesansicht — der
  Monat ist die grobe Ansicht, aus der man navigiert.
- **Liste** (`calendar-list.tsx`): sieben Tage, je eine Karte, Zeitspanne,
  Farbquadrat, Name, Art und Status-Chip. Tage ohne Eintrag entfallen ganz.
  Breite auf 820 px begrenzt — am Bild nachgemessen; über die volle Breite
  eines 2560-px-Schirms stehen Name und Chip an entgegengesetzten Enden einer
  leeren Zeile.
- **Blättern** im Monat um einen Monat, nicht um 42 Tage, und auf die Länge des
  Zielmonats geklemmt (`shiftMonth`): sonst wäre der 31. Januar der 3. März und
  die Kopfzeile nennte nach zwei Klicks einen anderen Monat als das Raster.
- **Kopfzeile**: „August 2026" ohne KW — eine Kalenderwoche sagt über einen
  Zeitraum, der fünf davon umfasst, nichts.
- **Zwei Entscheidungen, die kein Bild zeigt:** Die Google-Freibelegung wird in
  Monat und Liste nicht abgefragt (sechs Wochen Intervalle, die nichts
  zeichnet). Und wer die Terminsuche aus Monat oder Liste startet, landet in
  der Arbeitswoche — die Antwort sind Zeiten an Tagen, und nur das Raster kann
  sie zeigen.

**K5, as built** — zwei Nachbesserungen aus dem Durchsehen:

- **Die freien Zeiten waren zu blass.** `muted` auf 60 % über einer fast weißen
  Karte ist kaum vom Raster zu unterscheiden; sie sind jetzt aus
  `--muted-foreground` gemischt (12 % Fläche, 45 % Rahmen), damit die beiden
  Töne mit dem Kontrast des Themas skalieren statt mit seinem Hintergrund.
- **„Nächste freie Zeit" nimmt die Dauer aus dem Katalog**, nicht aus einer
  Konstante. Maßgebend ist die Vorgangsart mit `is_default`, solange sie eine
  Dauer trägt; **hat sie keine, erscheint die Karte gar nicht.** Die 60 Minuten,
  die vorher hier standen, waren eine Behauptung über die Praxis, die die
  Praxis nie aufgestellt hat. Die Karte nennt jetzt auch, *wofür* sie gesucht
  hat („Nächste freie Zeit · Folgesitzung"), weil die Antwort nur für diese
  Länge gilt — und sie folgt der Auswahl im Terminfinder.

## Rollen und Pseudonymisierung (D-R)

Kein Bildschirm-Paket, sondern eine Aufräumrunde vor dem nächsten: Rollen
werden zu reiner Kennzeichnung, und die einzige Stelle, an der eine Rolle je
inhaltlich zählen sollte, wird ein Schalter.

**R1, as built** — *Rollen sind Beschriftungen* (Migration `0035`):

- **`contact_role_type` verliert `code`, `is_system` und `active`**, samt dem
  Trigger `contact_role_type_protect_system`. Die Funktion `protect_system_type()`
  bleibt — `contact_relation_type` benutzt sie weiter, und dort tragen
  `billing_recipient` und `guardian` echte Logik. Die beiden Kataloge sind
  seitdem bewusst nicht mehr symmetrisch.
- **`contact_role.role_code` → `role_type_id`**, mit Datenumzug: neue Spalte,
  `UPDATE … FROM contact_role_type` über den Code, ein `DO`-Block, der die
  verwaisten Zeilen *zählt und benennt*, bevor `SET NOT NULL` sie über einen
  Constraint-Namen melden könnte, dann der Rest. Der zusammengesetzte
  Fremdschlüssel zeigt jetzt auf `(id, tenant_id)`.
- **`unique (tenant_id, label)`** tritt an die Stelle der Eindeutigkeit, die mit
  dem Kürzel wegfiel: die Bezeichnung ist ab jetzt das, wodurch eine Rolle
  erkannt wird, und zwei Reiter „Patient" wären unbedienbar.
- **Löschen sagt, wie viele.** `deleteRoleType` zählt die Zuordnungen vorher und
  wirft `RoleTypeInUseError(count)`; der Fremdschlüssel bleibt der Rückhalt
  dahinter, kann aber nur einen Constraint nennen.
- **Die Rollen eines Kontakts stehen in Katalogreihenfolge** (`sort_order`,
  `label`), über einen Join — nach der id zu sortieren wäre ein Münzwurf.
- **`patient` ist eine gewöhnliche Rolle.** Sie kommt im Seed mit `show_as_tab`
  mit und sonst nichts. Der Satz in `CLAUDE.md`, die Pseudonymisierung hänge an
  ihr, ist gestrichen — er war nie wahr: außerhalb eines Kommentars hat den Code
  nie eine Zeile gelesen.
- **Der leere Fall hat Texte.** Ohne angelegte Rollentypen sagt das
  Kontaktformular es in zwei Sätzen statt leer zu bleiben, und die Reiterzeile
  der Liste zeigt nur „Alle". Im Lesemodus heißt es „Keine Rolle zugeordnet —
  der Kontakt taucht dadurch nur unter ‚Alle' auf": der zweite Halbsatz ist der
  Punkt, weil das Fehlen kein Mangel ist, aber eine sichtbare Folge hat.
- **Die URL der Kontaktliste führt die uuid** (`?role=…`) statt des Kürzels. Ein
  zweiter Anker, nur für die Adresszeile gehalten, wäre der Code gewesen.

**R2, as built** — *die Pseudonymisierung ist eine Einstellung* (Migration `0036`):

- **`google_connection.pseudonymize`**, Vorgabe `true`. An der Verbindung und
  nicht an `practice_settings`: ohne Verbindung bedeutungslos, und
  `getPracticeSettings` antwortet mit der ganzen Zeile — der Schalter stünde
  dann in den Stammdaten, weit weg von den Sätzen, die ihn erklären. Trennen
  löscht die Zeile, also fängt der nächste Zugang wieder pseudonymisiert an.
- **`buildEvent` fragt in drei Stufen**, und die Reihenfolge ist der Punkt:
  „kein Kontakt" zuerst, in **beiden** Stellungen — ein Termin ohne Kontakt
  bleibt „Belegt", nie sein eigener Titel. Erst danach entscheidet der
  Schalter zwischen Nummer und Name.
- **Der Test ist zweigeteilt**, und die zweite Hälfte ist die wichtige: der
  Schalter darf genau eine Sache ändern. Gleiche Schlüsselmenge, weiter keine
  Leistung, keine Vorgangsart, keine Beschreibung — geprüft, indem beide
  Nutzlasten ohne `summary` verglichen werden.
- **Ein Test in `google-sync.test.ts` prüft die Verdrahtung**, nicht die
  Entscheidung: ohne dass `pushQueue` die Verbindung überhaupt liest, säße der
  Schalter sichtbar in den Einstellungen und bewirkte nichts.
- **Drei Sätze am Häkchen**: was das Abschalten bewirkt, dass es nur für
  künftige Termine gilt, und — nur wenn es abgeschaltet ist — dass Trennen die
  Einstellung zurücksetzt. Beschriftet als *„Namen statt Kontaktnummer
  übertragen"*, also als das, was das Ankreuzen tut.

**R3, as built** — *Anrede, Geschlecht und Land sind Kataloge* (Migration `0037`):

- **Drei Tabellen**, nicht eine mit `kind`: `salutation`, `gender`, `country`.
  Ein Katalog, eine Tabelle — so ist das ganze Schema gebaut. Alle drei nach
  dem Vorbild von `contact_role_type` nach 0035: `label`, `sort_order`, kein
  Kürzel als Anker, kein `active`. Eine Zuordnung ist eine leere machbare
  Spalte am Kontakt, also gibt es keine Sackgasse, die ein Flag verwalten
  müsste.
- **`country` trägt kein `label`.** Der Name kommt aus `countryName()`, was
  konfiguriert wird, ist eine *Auswahl* — welche Länder das Kontaktformular
  anbietet. Hinzufügen ist eine Suche über die ISO-Liste, kein Dropdown mit 250
  Zeilen.
- **`country.ts` hält nur noch Codes.** `countryName()` löst über
  `Intl.DisplayNames` auf, mit der Sprache aus `DISPLAY_LOCALE`. Der Nachteil
  steht als Kommentar an der Funktion: Server und Browser lesen aus zwei
  ICU-Beständen und könnten abweichen. Vertretbar, weil eine Rechnung genau
  einmal gerendert wird und danach als Datei liegt (Regel 9); die Antwort, falls
  es je stört, steht daneben — den *Namen* beim Festschreiben einfrieren.
- **Die Anrede gilt auch für Organisationen.** `contact_kind_fields` nennt sie
  nicht mehr: „Firma Mustermann GmbH" ist die übliche erste Zeile einer
  deutschen Anschrift. `title`, `first_name`, `date_of_birth` und `gender_id`
  bleiben Personen vorbehalten.
- **Der Default `DE` am Kontakt ist weg.** Leer heißt „nicht erfasst". Für das
  PDF ändert das nichts — bei Deutschland stand dort ohnehin nie eine
  Landeszeile.
- **Der Umzug prüft sich selbst**: ein `DO`-Block zählt die Zeilen, die einen
  Wert hatten und keinen mehr haben, und benennt sie, bevor die alten Spalten
  fallen.
- **`practice_settings.country` ist etwas anderes** und bleibt ein ISO-Code:
  eine Systemeigenschaft, an der hängt, welches Recht gilt. Die Menge ist
  `practiceCountries` in `packages/shared`, dazu eine Check-Constraint, die sie
  spiegelt — ein Eintrag dort ist die Behauptung, dass die Regeln umgesetzt
  sind, also braucht er einen Commit und eine Migration. Ein Eintrag heute,
  gelesen wird er von nichts.
- **Neuer Einstellungsbereich „Auswahllisten"**, nicht „Listen": Rollen,
  Beziehungen, Vorgangsarten und Textbausteine sind auch Listen. Was diese drei
  unterscheidet, ist, dass sie die Werte *eines Feldes am Kontakt* sind.

**Offen, bewusst nicht gebaut:** *Eine Anredezeile im Adressblock der Rechnung.*
Die Anrede steht seit R3 im `recipient_snapshot`, gedruckt wird sie nicht — der
Adressblock in `pdf/invoice.tsx` kennt sie nicht. Der Snapshot hält fest, was
galt, nicht nur was gedruckt wurde, also ist das kein Widerspruch. Ob die Zeile
kommt, entscheidet sich beim Rechnungsbildschirm; das Feld liegt bereit.

**Offen, bewusst nicht gebaut:** *Bereits geschriebene Google-Ereignisse
nachträglich anonymisieren.* Wer den Schalter wieder auf Pseudonymisieren
stellt, ändert nichts an dem, was schon draußen ist — die Einstellung gilt für
künftige Ereignisse, und der Bildschirm sagt das. Ein Nachziehen wäre machbar
(die Warteschlange kann jeden Termin erneut senden), aber es wäre nie
vollständig: was einmal in einem Google-Kalender stand, liegt längst im Cache
eines Telefons. Zu entscheiden, ob ein unvollständiges Nachziehen mehr wert ist
als der klare Satz, dass es keines gibt.

**Offen, bewusst nicht gebaut:** *Einen Termin löschen und den Vorgang behalten.*
Heute geht beides nicht getrennt — `deleteAppointment` verweigert, sobald ein
Vorgang hängt, und der Vorgang gibt seinen Termin nur mit auf. Was der Fall
bedeuten soll, ist nicht definiert: ein Vorgang ohne Kalendereintrag ist
zulässig (nachträglich dokumentiert), aber ob ein *entfernter* Termin dasselbe
heißen soll wie ein *nie angelegter*, hat noch niemand entschieden. Zu klären,
bevor es jemand braucht.


## Design-Korrektur 2 — 02 Kontakte (L)

Neun Pakete an den Kontaktbildschirmen. L1 bis L3 sind Grundlagen ohne
Aussehen; die Bilder in `docs/design-korrektur-2/02 - Kontakte/` sind für alles
Weitere die Vorgabe und stehen über den früheren Korrekturpaketen.

**L1, as built** — *Notizarten sind ein Katalog* (Migration `0038`):

- **`note_type`**, gebaut wie `contact_role_type` nach `0035`: `label`,
  `sort_order`, kein Kürzel als Anker, kein `active`. Dazu `show_as_tab` wie bei
  den Rollentypen — die Praxis entscheidet, welche Arten als Filterchip über der
  Notizliste stehen.
- **`note.type` → `note.note_type_id`**, Pflichtfeld, zusammengesetzter
  Fremdschlüssel auf `(id, tenant_id)`, `RESTRICT` in beide Richtungen. Die
  Bezeichnung reist als `noteTypeLabel` im Payload mit, verbunden beim Lesen und
  nirgends gespeichert: Umbenennen erreicht jede Notiz auf einmal.
- **Der Umzug musste den Sperr-Trigger abschalten.** `protect_locked_note` feuert
  `BEFORE UPDATE` und hätte jede gesperrte Zeile abgewiesen. Aus und direkt
  wieder an, mit dem Grund als Kommentar — die einzige Stelle, an der das je
  zulässig ist, und der Wartungsschritt für die Testnotizen trägt denselben.
- **Der Nachtrag ist keine Art mehr, sondern eine Eigenschaft.** `addendum` fiel
  weg, `note_addendum_target` mit ihm; `corrects_note_id` allein sagt es. Ein
  Nachtrag trägt eine gewöhnliche Art, vorbelegt mit der der korrigierten Notiz.
  Bestehende Nachträge haben ihre Art über eine rekursive CTE geerbt.
- **Der Hash nimmt die `id`, nicht die Bezeichnung.** Präzedenzfall ist
  `createdBy`: die Benutzer-id steht drin, der änderbare Name bewusst nicht. Eine
  korrigierte Schreibweise darf keine Dokumentation entwerten. Das Format wurde
  dafür einmal geändert — vor der Inbetriebnahme, und danach nie wieder; die drei
  gesperrten Testnotizen der Entwicklungsdatenbank sind mitgegangen, weil eine
  dauerhaft rote Kettenansicht bei jeder künftigen Prüfung in die Irre führt.
- **Der Filter greift auf die Elternnotiz.** Ein Nachtrag erscheint mit seiner
  Notiz oder gar nicht — allein in der Liste stünde er ohne den Bezug, auf den er
  sich beruft. Die Chips kommen aus `show_as_tab` allein, auch mit Null.
- **Der leere Fall bekommt keinen unlöschbaren Eintrag.** Das wäre das
  `is_system`, das `0035` den Rollen genommen hat, und es ist nur berechtigt, wo
  Logik an einer bestimmten Zeile hängt. Ohne Notizart ist „Neue Notiz"
  abgeschaltet, mit einem Satz und dem Verweis in die Einstellungen.
- **Vierte Karte unter „Auswahllisten"**, gleiche Bauform wie die Rollenkarte —
  bewusst ein zweites Bauteil und ein zweites Schema, obwohl beide Feld für Feld
  gleich sind: ein gemeinsames bände die Kataloge aneinander, sobald einer ein
  Feld bekommt.


**L2, as built** — *Entwurfsspeicher statt Autosave-Häkchen* (Migration `0039`):

- **`note_draft`** hält, was gerade geschrieben wird, und ist nicht die Notiz.
  Der Fall, der die Bauweise trägt, ist die *bestehende* Notiz: dort darf der
  Editor nicht in die Zeile schreiben, sonst wäre „Abbrechen" unmöglich und ein
  Absturz mitten im Umformulieren machte einen halben Satz zur gültigen
  Dokumentation.
- **Zwei partielle Unique-Indizes**, weil NULL in einem gewöhnlichen nicht als
  Wert gilt: einer je Benutzer und Notiz, einer je Benutzer und Kontakt für die
  noch nicht existierende Notiz.
- **`corrects_note_id` ist eine Spalte**, obwohl der Auftrag sie nicht nannte.
  Ein Nachtrag ist eine *neue* Notiz und teilt sich den einen Entwurf je
  Kontakt; ohne die Spalte würde aus zwanzig Minuten Nachtrag beim Übernehmen
  stillschweigend eine gewöhnliche Notiz. Die Rückfrage nennt den Bezug.
- **`note_date` und `note_type_id` sind nullable** — der Entwurf spiegelt das
  Formular samt seiner Lücken. Ein Sicherungslauf, der scheitert, weil das
  Datumsfeld beim Umtippen kurz leer ist, verlöre genau das, wofür es die
  Tabelle gibt. Pflicht ist nur `text`, und nicht leer.
- **Gesperrte Notiz, drei Riegel:** die Domäne verweigert für den Satz, der
  Trigger `note_draft_requires_open_note` macht den Zustand unerreichbar, und
  `lockNote` löscht die Entwürfe zu dieser Notiz *in derselben Transaktion* —
  alle, nicht nur die des sperrenden Benutzers. Danach zu löschen hinterließe
  einen Entwurf, den der eigene Trigger unlöschbar macht.
- **Drei Sekunden nach dem letzten Tastendruck, spätestens alle zwanzig.** Kein
  `beforeunload`: der Fall, für den es das gibt, ist ein Absturz, und der feuert
  kein Ereignis. Stattdessen `flush()` beim Schließen, damit „der Entwurf bleibt
  liegen" bis zum letzten Tastendruck stimmt.
- **Ein Entwurf, der älter ist als seine Notiz, wird nicht ausgeliefert** — und
  ist damit das Netz unter dem Löschen nach dem Speichern. Weggeräumt wird beim
  Anmelden, neben `deleteExpiredSessions`: veraltete sofort, unberührte nach
  30 Tagen.
- **Verdrahtet in den heutigen Notizdialog**, der Haken aber gegen den
  *Formularzustand* geschrieben, nicht gegen den Dialog — L6 holt das Schreiben
  in den Lesebereich, und er zieht unverändert mit.


**L3, as built** — *Listen serverseitig, mit Nachladen* (keine Migration):

- **Cursor statt Offset**, `domain/keyset.ts`, 50 Zeilen je Abruf. Dazu die
  `id` als zweiter Sortierschlüssel — ohne sie haben zwei gleichnamige Kontakte
  keine eigene Reihenfolge, und die zweite Seite hätte einen doppelt und einen
  gar nicht gebracht. Der Fehler steckte in jeder Listenabfrage und war
  unsichtbar, solange nie nachgeladen wurde.
- **NULL hinten in beiden Richtungen**, `total` nur bei der ersten Seite, ein
  fremder Cursor wird mit 400 abgewiesen statt still von vorn zu beginnen.
- **Der Umschalter „Aktuell / A–Z" ist weg**, samt Zeitfenster und dessen
  Filterwirkung. Eine gewöhnliche Sortierung, Vorgabe Name aufsteigend;
  sortierbar sind Nr., Name, Ort und Geburtsdatum. Rollen nicht — eine Menge
  hat keine Reihenfolge; die drei Katalogfelder auch nicht, dort stünde eine id
  oder es bräuchte einen Join.
- **Die Spalte „Termin" ist ganz aus der Kontaktliste heraus**, mit
  `appointmentAt` aus dem Payload und dem Join aus der Abfrage. Sie ist kein
  Stammdatum, und ob die Praxis sie hier braucht, ist offen — erst lernen, dann
  bauen.
- **Die Vorgangsliste bekommt zwei Regeln statt einer Ordnung:** „Kommend"
  ganz, aufsteigend, ohne Obergrenze; „Bisher" zu 50, absteigend. Die
  Aufteilung lag bisher im Browser und wäre mit der ersten nachgeladenen Seite
  falsch geworden.
- **Der neue Vorgang findet seinen Platz ohne Server.** Ist er da, wird
  hingescrollt und hervorgehoben; ist er es nicht, sagt ein Streifen warum —
  und unterscheidet dabei „liegt weiter zurück" von „gehört nicht in die
  aktuelle Auswahl" allein daran, ob noch etwas nachzuladen ist.
- **Der Kontaktpicker bekam eine eigene Abfrage.** Ein Picker scrollt nicht, er
  wird enger getippt; eine Infinite-Query in einem Dropdown wäre Mechanik, die
  dort niemand benutzt.


**L4, as built** — *Kontaktliste* (keine Migration):

- **Vierzehn Spalten im Angebot, fünf voreingestellt.** Nr., Name, Rollen,
  Straße, Hausnummer, PLZ, Ort, Land, E-Mail, Mobil, Festnetz, Geburtsdatum,
  Art, Archiviert. Straße und Hausnummer getrennt, wie im Modell.
- **Nicht sortierbar sind zwei**, und beide, weil Sortieren eine Regel erfinden
  hieße: Rollen (eine Menge) und Land (der Name entsteht erst im Browser aus
  dem ISO-Code). `contact.kind` wird als Text verglichen — ein `pgEnum` sortiert
  sonst nach Deklarationsreihenfolge und stellte „Person" vor „Organisation",
  egal wohin der Pfeil zeigt.
- **Die interne Notiz ist aus `listColumns` heraus**, aus demselben Grund, aus
  dem die Diagnose nie darin war: Freitext über einen Patienten, den keine
  Spalte zeigt und jede Zeile jeder Seite mitschleppte.
- **Die Tabelle endet am Fensterrand** und scrollt in sich, die Kopfzeile bleibt
  stehen. Dafür brauchte `ui/table.tsx` einen Weg an seinen Container: dessen
  `overflow-x-auto` ist ein Scrollport in *beiden* Achsen, und ein `sticky`
  Kopf hätte sich daran verankert statt an der Fläche, die wirklich scrollt.
- **Filterband ohne Karte**, mit Trennlinie über die volle Breite; der
  Suchhinweis steht unter dem Feld, das ihn auslöst. Kopfzeile in Versalien —
  die Schriftgröße steht auch am Sortierknopf, weil ein `button`
  `text-transform` nicht erbt.
- **Der Spaltenwähler wird gezogen**, wie im Bild, und ist zusätzlich mit den
  Pfeiltasten am Griff bedienbar. Der gezogene Schlüssel kommt aus der
  Nutzlast des Drag-Vorgangs, nicht aus React-State: `dragstart` fordert nur
  ein Rendern an, ein sehr schneller Drop läse den State sonst als leer.
- **Überstimmt:** D2, wo die Pfeile gegen das Ziehen gewonnen hatten. Die
  Bilder stehen darüber.


**Nach L4** — *Das gespeicherte Thema greift beim ersten Laden*:

- **Der Fund:** `applyTheme` hing in einem Effekt im `ThemePicker`, und der
  montiert nur im Konto-Menü. Wer das nie öffnete, saß in einem frischen
  Browser im hellen Schema, obwohl `nacht` gespeichert war — auf jeder Seite,
  dauerhaft.
- **Angewandt wird jetzt in `_app.beforeLoad`**, direkt nachdem die
  Einstellungen geladen sind. Die lagen dort schon vor; nur angewandt hat sie
  niemand. Das läuft vor dem ersten Rendern der Hülle.
- **Gegen das Aufblitzen hilft das allein nicht**, denn davor liegen zwei
  Anfragen. Deshalb schreibt der Server ein lesbares Cookie `praxi_theme` — in
  derselben Antwort wie das Sitzungscookie, dazu bei jeder Änderung der
  Einstellung, und beim Abmelden gelöscht. Das Inline-Script in `index.html`
  liest es statt `localStorage`: Ein Browser, der die Anwendung nie ausgeführt
  hat, kann das Thema nicht kennen, aber der Server kann es ihm mitgeben.
  Gemessen: 120 ms nach dem Neuladen steht `data-theme="nacht"` und der Körper
  ist bereits dunkel.
- **`localStorage` entfällt** — zwei Zwischenspeicher für einen Wert, und nur
  einer davon konnte vom Server befüllt werden.
- Der Anmeldebildschirm bleibt im Standardschema. Bevor jemand sagt, wer er
  ist, gibt es keine Vorliebe; das ist kein Aufblitzen, sondern die Reihenfolge.


**L5, as built** — *Übersicht und Stammdaten*. Keine Migration.

- **Der nächste Termin ist ein Termin, kein Vorgang mit Termin.** Die Karte las
  die Vorgangsliste und behielt daraus die mit Kalendereintrag — ein
  freistehender Termin (seit D-K1 möglich) war damit nie „der nächste", wie
  nah er auch stand. `nextContactAppointment` fragt `appointment`, überspringt
  die freigegebenen Status (`SLOT_RELEASING_STATUSES`) und antwortet mit einem
  `CalendarEntry` oder `null`.
- **Der Termine-Reiter hatte denselben Fehler** und ist derselbe Griff:
  `listContactAppointments` liest ebenfalls `appointment`, sortiert wie die
  Vorgangsliste (kommend aufsteigend, dann bisher absteigend) und zeigt damit
  auch die Termine ohne Vorgang. Der Reiter bleibt — er fehlt in den Bildern,
  das war ein Versehen, keine Entscheidung.
- **`calendarEntrySchema` bekam `activityTitle`.** Eine Spalte des Left Joins,
  die es schon gab: die Übersicht benennt einen Termin so, wie jeder andere
  Bildschirm einen Vorgang benennt — `activityLabel()`, Titel vor Typlabel —
  und ohne Vorgang steht dort der Titel des Termins. Nicht `entryName()` aus
  `lib/calendar-entry.ts`: das fällt auf den Kontaktnamen zurück, der in der
  Akte dieses Kontakts nichts sagt.
- **„Abrechenbar" bietet den Weg immer an, solange etwas offen ist.** Vorher
  erschien der Link nur, wenn schon ein Entwurf existierte — also gerade im
  einen Fall nicht, für den er da ist. Zwei Beschriftungen, weil ein
  Bedienelement keinen Zustand behaupten darf, den es nicht gibt: mit Entwurf
  „Zum Rechnungsentwurf", ohne „Rechnung erstellen", was einen anlegt und
  öffnet. Ziel bleibt vorerst die Rechnungsseite; L8 verlegt den Editor in den
  Reiter und dreht dieses eine Ziel an einer Stelle um.
- **„Letzte Vorgänge" springt in den Vorgänge-Reiter** und öffnet den Vorgang
  dort im Lesemodus. Der Suchparameter `activityId` trägt das Ziel, weil ein
  Link den Zurück-Knopf überleben muss; `useInlineDetail(initialOpenId)` nimmt
  ihn als *Startzustand*, nicht als gesteuerten Wert — ab da ist ein Klick auf
  eine andere Zeile das gewohnte Umschalten.
- **Die Übersicht holt keine Historie mehr.** Sie fragte die kompletten
  Vorgänge des Kontakts ungepaged, für den letzten und fünf Zeilen. Jetzt die
  erste Seite von `past` — dieselbe Anfrage, die der Vorgänge-Reiter ohnehin
  macht.
- **Verknüpfte Kontakte, neu nach den Bildern:** Tabelle mit Kopfzeile (Art der
  Beziehung · Kontakt · Aktionen), Stift und Papierkorb je Zeile,
  „+ Beziehung hinzufügen" am Fuß. Bearbeiten ersetzt die Zeile an Ort und
  Stelle, Neuanlegen erscheint als eingerückter Kasten darunter.
- **`updateRelation` ersetzt `replace`.** Löschen und Einfügen in *einer*
  Transaktion, kein UPDATE: welche zwei Kontakte die Zeile halten und in
  welcher Reihenfolge, hängt an der Art (symmetrische werden normalisiert), also
  kann eine Änderung jede Spalte bewegen. Genau diese Transaktion war die
  Zusage, für die es `contactRelationInputSchema.replace` gab — der Fall
  („Rechnungsempfänger austauschen") ist jetzt das Bearbeiten der Zeile, die
  dasteht. Zwei Wege für eine Sache sind einer zu viel.
- **Überstimmt:** die K-Entscheidung, den Rechnungsempfänger nach oben zu ziehen
  und mit einer Linie abzusetzen. Die Bilder zeigen eine flache Liste in
  Katalogreihenfolge. Was keine Kosmetik war, bleibt: eine exklusive Art, die
  der Kontakt schon hält, ist im Menü gesperrt und sagt warum.
- **Rollen im Lesemodus** zeigen nur noch die Abzeichen; die Zeile „Nicht
  zugeordnet: …" entfällt (sie stand im Bild und war nicht gewollt — sie
  listete unter jeder Akte den Katalog minus einen Eintrag). Ohne Rolle steht
  dort ein Satz.
- **E-Mail und Telefon sind im Lesemodus über das Symbol klickbar**, rechts in
  der jeweiligen Spalte, `mailto:` und `tel:` — nicht der Wert selbst: eine
  Adresse, die man markieren und kopieren will, darf unterwegs kein
  Mailprogramm öffnen.
- **Eine einzige Kappung im Produkt: 1180**, und sie ist eine *Inhaltsbreite*.
  `ContentWidth` hatte zwei Werte, die zwei verschiedene Dinge bedeuteten —
  1180 einschließlich der Seiteneinrückung (also 1116 Inhalt), 1100 als Inhalt.
  Gemessen an den L5-Bildern läuft die Stammdatenkarte bei 1728 px Fenster von
  268 bis 1447, und 268 ist das Ende von `px-8`. Der Prop entfällt; ein
  Bildschirm ist entweder auf 1180 gekappt oder läuft über die volle Breite.
  Die **Übersicht der Kontaktakte ist der zweite Fall** (268..1696), jeder
  andere Reiter der erste. Nebenwirkung, gewollt: Einstellungen, Leistungen,
  Zahlungen und die Vorgangsliste haben 64 px mehr Inhalt als vorher,
  `contacts/new` 80 px.


**L6a, as built** — *Der Notiz-Editor*. Keine Migration.

- **Milkdown über ProseMirror**, `@milkdown/kit` und `remark-breaks` — sonst nichts.
  Nicht Crepe (886 KB gzip und eine fertige Oberfläche mit eigenem CSS), nicht
  `@milkdown/react` (das zieht Crepe mit). Die Plugin-Liste ist **einzeln
  zusammengesetzt**, konstruktweise; die Presets sind selbst nichts anderes als
  solche Listen.
- **`packages/shared/src/note-mdast.ts` ist die Definition**, was eine Notiz
  enthalten darf: `NOTE_MDAST_TYPES`, achtzehn mdast-Typen. Die Regel ist
  generisch statt eine Liste von Sonderfällen — Bekanntes weg, Unbekanntes
  durch seine Kinder ersetzt oder durch seinen Text. Damit trägt sie ein
  Konstrukt, das es noch nicht gibt; `==Hervorhebung==` wird eines Tages genau
  das sein.
- **Der Normalisierer ist kein Aufräumen, sondern tragend.** Gemessen in
  Chrome 151: eine Notiz mit `![x](data:…)` durch die schmale Plugin-Liste
  geladen wirft bei `create()`, und danach existiert **kein Editor** —
  `document.querySelector('.ProseMirror')` ist `null`. Ein einmal aus einer
  Mail eingefügtes Bild hätte diese Notiz für immer unöffenbar gemacht. Er
  greift, weil `@milkdown/transformer` mit `remark.runSync(remark.parse(md))`
  parst, ein `$remark`-Transformer den Baum also vor dem Parser-Walk sieht.
- **Der Gleichheitstest** (`note-editor-plugins.test.ts`): `NOTE_SCHEMA_PLUGINS`
  ist nach mdast-Typ verschlüsselt und die geladene Plugin-Liste wird daraus
  *abgeleitet* — ein Schema-Plugin ohne Eintrag ist damit unmöglich. Der Test
  schließt die andere Richtung. Die beiden Hälften versagen entgegengesetzt:
  ein erlaubter Typ ohne Plugin nimmt den Editor mit, ein Plugin ohne Eintrag
  löscht beim nächsten Öffnen still, was geschrieben wurde. **Bilder sind die
  eine benannte Ausnahme**, `IMAGE_IS_DEFERRED`, damit das Bilder-Paket sie
  bewusst aufhebt.
- **Drei Wege, eine Liste** (`note-editor-commands.ts`): Auswahl-Leiste,
  Slash-Menü, Plus im Randstreifen. **Jede Aktion, die sich einschalten lässt,
  lässt sich ausschalten** — Milkdowns Mark-Kommandos sind Umschalter, die
  Block-Kommandos nicht, also trägt jede Blockaktion ihr eigenes `isActive` und
  fällt bei erneutem Druck auf einen Absatz zurück. Genau der Punkt, an dem
  Crepe scheitert.
- **Der Renderer ist ein mdast-Walker mit Element-Register**, kein
  `react-markdown`: ein neuer Knotentyp kostet drei Einträge und keinen Umbau,
  „kein HTML" ist eine Eigenschaft der Form statt einer Einstellung, und er
  kostet **null Bytes** — Milkdown bringt remark-parse, remark-gfm und micromark
  ohnehin mit (gemessen: Editor allein und Editor+Renderer sind gleich groß).
- **Konfiguration:** `remark-breaks` über `$remark`; `remarkStringifyOptionsCtx`
  mit `bullet: '-'` **und `rule: '-'`** — ohne das zweite schreibt der erste
  Speichervorgang jede bestehende `---` zu `***` um; `handlers: { break: () =>
  '\n' }`; `remarkPreserveEmptyLinePlugin`, `remarkHtmlTransformer`,
  `remarkInlineLinkPlugin` und `remarkLineBreak` bleiben ungeladen. Der Text
  geht über `defaultValueCtx` in den Ausgangszustand, nie per `replaceAll`.
- **Vier Funde, alle im Browser gemessen:**
  1. Die Fließlayer dürfen **nicht** `display: none` sein — floating-ui vermisst
     das Element, und ein nicht dargestelltes meldet `offsetParent === null`;
     der Griff landete 350 px unter seinem Block, im Dialog unter dem Overlay.
  2. `dispatchTransaction` darf `view.dispatch` nicht zurückrufen — das ist der
     Aufrufer, die Rekursion war unbegrenzt, und der Editor nahm still gar
     keine Eingabe an.
  3. Reacts doppelter Effekt in der Entwicklung: das `destroy` des ersten
     Editors lief nach dem zweiten und nullte dessen Provider-Ref.
  4. Das Blockmenü braucht zwei Zustände — per `/` geöffnet schließt es mit dem
     Schrägstrich, per Plus geöffnet darf es das nicht.
- **`apps/web` hat jetzt Vitest**, für genau eine Art Test: zwei Listen, die
  übereinstimmen müssen. Bildschirme werden weiter im Browser geprüft.
- **Bundle:** 1040 → 1512 KB roh, **328 → 470 KB gzip**.
- Gelöscht: `note-markdown.ts` samt `parseNoteText`, `Block`, `Inline`,
  `NOTE_MARKERS`, die Textarea, der Vorschau-Umschalter und die
  `execCommand`-Aufrufstelle.
- **Der Notizen-Reiter bleibt unverändert** — Dialog, Chips, Panel. Das ist L6b;
  getrennt prüfbar zu sein war der Sinn der Teilung.


**L6b, as built** — *Der Notizen-Reiter*. Keine Migration.

- **Geschrieben wird da, wo gelesen wird.** `note-dialog.tsx` ist gelöscht;
  „Neue Notiz", „Bearbeiten" und „Nachtrag" stellen `NoteForm` in die rechte
  Spalte. Das Formular nimmt kein `open` und kein `onOpenChange` mehr — es
  existiert genau, solange es benutzt wird, und jeder Effekt, der auf `open`
  hörte, ist ein State-Initialisierer geworden. **Von Anfang an
  wiederverwendbar:** `activityPicker={false}` lässt die Vorgangs-Auswahl weg,
  was der Vorgangs-Reiter in L7 braucht.
- **Die vorläufige Zeile ist ein Prop, keine Notiz mit erfundener id.** Datum
  und Art folgen dem Formular (`onMeta`, in `useCallback` und als No-op, wenn
  sich nichts bewegt hat — sonst rendert der Melder sich selbst neu). Eine neue
  Notiz steht oben, egal welches Datum sie trägt; ein Nachtrag steht eingerückt
  unter seiner Elternnotiz, also da, wo er nach dem Speichern landet.
- **Zählen und Filtern sind zwei Regeln** (Regel 7 nachgezogen). Gezählt
  zeilenweise nach der eigenen Eigenschaft — ein Nachtrag unter „Nachtrag" und
  unter nichts sonst; gefiltert mit Schließung in beide Richtungen bis zum
  Fixpunkt. Im Browser geprüft: „Nachtrag" (1) zeigt 2 Zeilen, „Sitzung" (3)
  zeigt 4, „Gesperrt" (3) zeigt genau die drei des Bildes.
- **„Nachtrag" ist ein Chip und bleibt keine Notizart.** Er steht bei „Gesperrt"
  und „Offen", vor dem Katalog. Das Bild zeichnet ihn zwischen die Arten, was
  keine allgemeine Reihenfolge herstellen kann.
- **Der Vorgang-Picker lädt 30 und sagt es.** Vorher fragte er die
  Standardseite von 50 und schwieg über die 51. — eine stille Kappung liest
  sich als „mehr gibt es nicht". Der Hinweis erscheint nur, wenn die Antwort
  einen `nextCursor` trägt.
- **`listNotes` sortiert absteigend.** Der Docstring behauptete das seit
  Slice 5 und die Query tat das Gegenteil; die Liste war kurz genug, dass es
  niemandem auffiel. Die Gruppierung der Nachträge unter ihre Elternnotiz ist
  Sache des Bildschirms (`orderNotes`) — ein Nachtrag hat ein eigenes Datum und
  stünde sonst weit weg von dem, was er ergänzt.
- **„Dokumentieren" springt** über `?tab=notes&activityId=…` und verbraucht den
  Parameter einmal, damit ein späterer Besuch des Reiters kein Formular öffnet,
  nach dem niemand gefragt hat. Ein Parameter, weil es eine Tatsache ist —
  welcher Vorgang gemeint ist —, und was sie bedeutet, entscheidet der Reiter.
- **Der aktive Filterchip ist dunkel gefüllt** (`chip.tsx`), womit die
  Begründung dort umgestoßen ist: eine *Reihe* von Chips ist keine Reihe von
  Knöpfen, nur einer ist je gefüllt, und die helle Tönung war ein Zustand, den
  man suchen musste. Trifft auch Vorgänge und Rechnungen — dieselbe
  Formsprache, deren Bilder in L7 und L8 kommen.
- **Bewusst hingenommen:** der Editortext steht 20 px weiter rechts als der
  Lesetext, weil `note-editor-surface` links 2,75 rem für Plus und Griff
  freihält. Weniger Rand ließe den Randstreifen über den Text laufen, ein
  negativer Rand über die Trennlinie zur Liste.


**L7, as built** — *Vorgänge*. Keine Migration.

- **Die Chips filtern und zählen auf dem Server.** Fünf statt sechs: „Ohne
  Termin" fällt weg, denn der Reiter filtert Vorgänge und keine Termine. Der
  Terminstatus bleibt als Kennzeichnung in jeder Zeile — ein abgesagter Termin
  will beim Überfliegen gesehen werden, was etwas anderes ist als danach zu
  filtern. Gemessen: jeder Chip liefert genau seine Zahl an Zeilen, und die
  Zahlen stehen still, während man sie drückt.
- **`activityBillingCondition` steht in `billable.ts`**, neben
  `claimedByAnActiveInvoice`, und ist der vierte Leser dieser Bedingung. Eine
  zweite Fassung in `activity.ts` hätte in jedem leichten Fall dasselbe gesagt
  und bei einer stornierten Rechnung etwas anderes — der Test dazu storniert
  und prüft, dass die Zeile von „Abgerechnet" zurück auf „Nicht abgerechnet"
  fällt und die Kennzeichnung an der Zeile dasselbe sagt.
- **`activitySummary` nimmt `contactId` und beide Grenzen optional.** Ein
  Kontakt hat kein Fenster; eines zu verlangen hätte geheißen, eines zu
  erfinden, und die Zahlen hätten dann etwas beschrieben, das die Liste
  daneben nicht ist. Dazu zwei Zählungen, `billed` und `unbilled`, die sich
  nicht zu `total` addieren — ein Vorgang ohne abrechenbare Position ist
  keines von beidem.
- **„Offen" heißt jetzt „Nicht abgerechnet"**, in der Zeile wie auf dem Chip.
  Ein Zustand unter zwei Namen war das eigentliche Problem.
- **Der Abschnitt heißt „Anstehend"**, nicht „Kommende Termine": es sind
  Vorgänge, und einer davon hat womöglich gar keinen Termin.
- **Ein Bauteil, zwei Füße.** Im aufgeklappten Detail „Schließen" und
  „Bearbeiten", im Kalenderdialog „Absagen" und „Bearbeiten" — dieselbe
  Komponente, `footerPortal` entscheidet. Dazu im Detail die interne Notiz im
  Lesemodus und eine Terminleiste, die die Dauer nennt und sagt, ob der
  Zeitraum belegt bleibt.
- **„Notiz hinzufügen" schreibt nicht hier.** Es springt über
  `?tab=notes&activityId=…` in den Notizen-Reiter — derselbe Weg wie
  „Dokumentieren" auf der Übersicht. Ein zweiter Ort zum Schreiben hätte einen
  zweiten Entwurf, fehlende Filterchips und eine eigene Antwort auf den
  Nachtrag gebraucht; die zweite Ausprägung von `NoteForm` ist damit nicht
  nötig geworden.
- **Die Positionszeile verliert ihre vier Beschriftungen** und trägt sie als
  `aria-label` weiter. Viermal Kleingedrucktes pro Zeile war eine Wand; was
  eine Zeile hält, liest man an den Werten. Die Reihenfolge-Pfeile bleiben,
  obwohl kein Bild sie zeigt.
- **Der tote String `statusHint` ist weg**, der `COMMENT ON COLUMN` bleibt.
  Der falsche Docstring in `service-picker.tsx` — „used in the calendar and,
  for now, only there" — ist korrigiert: geteilt war das Formular schon, als
  der Satz geschrieben wurde.



**L8, as built** — *Rechnungen*. Migration `0040_invoice_recipient`.

- **`invoice.recipient_contact_id`**, nullable — NULL heißt: der Kontakt
  selbst. Damit liest zum ersten Mal etwas den Beziehungstyp
  `billing_recipient`, der seit Slice 6.5 als Systemeintrag steht und dem
  `CLAUDE.md` seither zuschreibt, über den Empfänger zu entscheiden. Die Wahl
  ist **nicht frei**: `updateInvoice` prüft gegen dieselbe Liste, aus der der
  Picker gefüllt wird, sonst ließe sich eine Patientenrechnung per Request an
  jeden Kontakt der Kartei adressieren.
- **Einmal gelesen, beim Festschreiben.** Danach ist `recipient_snapshot`, was
  das Dokument sagt. Der Test löst die Beziehung nach dem Festschreiben auf und
  prüft, dass die Rechnung weiter sagt, an wen sie ging.
- **Die Stornorechnung übernimmt den Snapshot des Originals**, statt den
  Kontakt neu aufzulösen. Das war vorher bloß ungenau — ein umgezogener Patient
  bekam die neue Adresse auf das Gegendokument — und wäre mit Empfängern falsch
  über die *Person*: eine an die Mutter gerichtete Rechnung hätte ein an das
  Kind gerichtetes Storno bekommen.
- **Eine Positionsliste statt zwei Abschnitten.** Vorher standen die Zeilen der
  Rechnung oben und eine Liste „Abrechenbar" zum Ankreuzen darunter — zwei
  Stellen für eine Frage. Jetzt steht jede noch verfügbare Position einmal da,
  unter ihrem Vorgang, angehakt wenn sie auf der Rechnung ist.
- **Die Geste hängt an der Art der Position, in beiden Modi.** Checkbox für
  Positionen aus Vorgängen, × für freie. Die Kopf-Checkbox am Vorgang ist ein
  Helfer und keine Einheit: sie hakt alle offenen Positionen an und zeigt nur
  dann voll, wenn jede es ist — dazwischen die dreiwertige Form aus D2.
- **Abgehakt und noch nicht gespeichert bleibt sichtbar** (`GroupRow.detached`).
  Sonst verschwindet die Zeile beim Abhaken und es gibt keinen Weg zurück, bevor
  gespeichert wird; in der abrechenbaren Liste steht sie auch nicht, denn die
  zählt sie bis zum Speichern als beansprucht.
- **Ein `InvoiceDetail`, zwei Behälter.** Aufgeklappt in der Zeile des
  Kontaktreiters, und `/invoices/$invoiceId` als dünne Seite darum — vier
  Stellen verlinken dorthin. Der Lesemodus ist **kein Formular ohne Felder**,
  sondern das Dokument mit einer Leiste daneben; die Seite hatte die K2-Runde
  nie mitgemacht und zeigte jeden Wert in einem deaktivierten Eingabefeld.
- **Keine Nummernvorschau** (Eintrag in `abweichungen.md`), stattdessen „Die
  Nummer wird beim Festschreiben vergeben."
- **Kein Leistungszeitraum.** Jeder Vorgang hat ein Datum, jede Position trägt
  es mit, das PDF zeigt sie — die Information steht ohnehin da. Nachgesehen:
  eine freie Position bekommt das **Rechnungsdatum** als Leistungsdatum, bleibt
  aber änderbar; sie bleibt nicht leer.
- **Der Leistungspicker auch hier**, und ein Katalogtreffer wird eine *freie*
  Position: er hängt an keinem Vorgang.
- `invoice_line` trägt jetzt `activityOccurredAt`, `activityType` und
  `activityTitle` mit — drei Spalten auf einem Join, den es schon gab, gegen
  eine Anfrage pro Rechnung.



**L8a, as built** — *Überschriften und die Gleichheit von Editor und Leser*.
Keine Migration, kein Schema.

- **Alle drei Überschriftenebenen sahen gleich aus**, und das war Absicht
  gewesen: `.note-prose` setzte h1 bis h3 auf `font-size: 1em`, mit der
  Begründung, die Ebene werde gespeichert, weil sie geschrieben wurde, und
  nicht, weil sie zu sehen sein soll. Falsch — wer `###` tippt, hat gesagt,
  dass er etwas Engeres meint als `#`. Jetzt 1.4 / 1.15 / 1 em, in Schritten,
  die zu einer Akte passen und nicht zu einem Artikel.
- **Der eigentliche Fund war ein anderer:** der Editor stellte die Notiz in
  16px dar, die Lesespalte in 14. Die Größe hing am Aufrufer (`text-sm` an der
  einen Stelle, nichts an der anderen), und weil fast alles darunter in `em`
  bemessen ist, zog dieser eine Schritt **jedes** Konstrukt auseinander:
  Blockabstände, Inline-Code, Überschriftenränder. Die Größe steht jetzt in
  `.note-prose` selbst.
- **Das Häkchen der Aufgabenliste war zweierlei Steuerelement.** Die
  Lesespalte zeichnet ein echtes `<input type="checkbox">`, der Editor ein
  `::before` — 13×17,5 px mit eckigen Ecken neben 11,9 px mit runden, und der
  angehakte Zustand einmal mit Haken und einmal ohne. Beide teilen sich jetzt
  einen Satz Deklarationen; der Haken ist ein Hintergrundbild, weil ein
  `<input>` ein ersetztes Element ist und `::after` darin nicht rendert.
- **Nachgemessen statt geraten:** eine Notiz mit jedem Konstrukt aus
  `NOTE_MDAST_TYPES`, dann beide Seiten Eigenschaft für Eigenschaft
  verglichen. **19 von 20 messen jetzt identisch**; die zwanzigste ist der
  Tabellen-Rand, den die Lesespalte an ihrem Scroll-Rahmen trägt — der
  sichtbare Abstand ist auf beiden Seiten 11 px.
- **Was nicht daneben lag:** Listen behalten ihre Aufzählungszeichen und ihre
  Einrückung, Zitate ihren Balken, Code seinen Grund, Tabellen ihre Linien und
  den grauen Kopf. `.note-prose` deckte das schon ab; die Sorge, Tailwinds
  Preflight habe es abgeräumt, traf nur die Überschriften — und dort war es
  unsere eigene Regel und nicht die von Tailwind.


## S-A — Routen sind standardmäßig geschützt

Die erste von zwei Scheiben am Authentifizierungsrand. Sie hakt die ersten beiden Zeilen
aus "Before going live" ab und ändert kein Verhalten für einen angemeldeten Benutzer.

- **`middleware/api-guard.ts`** ist neu und ist ab jetzt der einzige Ort, an dem die
  Anwendung entscheidet, ob eine Anfrage eine Sitzung braucht. `app.use('/api/*', apiGuard)`
  steht in `app.ts` hinter `sameOrigin` und **vor** der `route()`-Kette — Hono führt
  Middleware in Registrierungsreihenfolge aus, ein `use()` hinter den Routen käme nach deren
  Handlern und bewachte nichts.
- **25 Zeilen `.use('*', requireAuth, withTenant)`** sind aus 20 Routendateien verschwunden,
  samt der überflüssig gewordenen Importe. `requireAuth` und `withTenant` selbst sind
  unverändert, ebenso `tenantId(c)` und `userId(c)`.
- **Zwei Sonderfälle sind damit verschwunden statt dokumentiert zu werden.**
  `GET /api/auth/me` trug `requireAuth` inline und kein `withTenant`;
  `/api/user-preferences` ebenso. Beide bekommen jetzt beides, was nichts kostet — eine
  Sitzung hat immer einen Mandanten — und einen Grund weniger zum Nachdenken.
- **Der Google-OAuth-Callback war durch seine Position geschützt**: er stand über der
  `requireAuth`-Zeile seines Routers. Jetzt ist er ein Eintrag in `PUBLIC_API_ROUTES` mit
  seiner Begründung daneben. Dieselbe Ausnahme, an einer Stelle, die kein Umsortieren einer
  Kette verlieren kann.
- **Es war keine Route vergessen worden.** Die vier offenen Endpunkte waren genau die vier
  beabsichtigten. Das Risiko war strukturell, nicht aktuell — und der Test ist das, was es
  strukturell bleibt.
- **`routes/api-guard.test.ts`**, acht Zusicherungen über `app.routes`. Gegenprobe gemacht:
  ohne die `apiGuard`-Zeile meldet der Test 157 offene Endpunkte, `GET /api/auth/me`
  als ersten — ein Test, der nur grün ist, beweist nichts.
- **Unbekannte Pfade unter `/api` antworten jetzt 401 statt 404.** Die Zusicherung über den
  deutschen 404-Körper in `routes/health.test.ts` prüft ihn deshalb an einem Pfad außerhalb
  von `/api`; derselbe Handler, dieselbe Antwort.
- Im Browser gegen beide Dev-Server geprüft: Anmeldung, Kontakte, Vorgänge, Kalender,
  Zahlungen, Leistungen, Einstellungen, Übersicht — kein 401 im Netzwerkprotokoll der SPA.

## S-B — Better Auth

Die Eigenbaulösung für Sitzungen ist ersetzt. Der Grund ist die Zukunft und nicht ein Fehler
im Ersetzten: mehrere Benutzer und Mandanten, Passwort-Zurücksetzen, 2FA, später Anmeldung
über Google oder Microsoft. Und der Zeitpunkt gehört zum Argument — heute war die Migration
ein Benutzer und eine Sitzung.

- **Warum nicht Auth.js**, das auf der Verbotsliste in `CLAUDE.md` stand und dort gegen Better
  Auth getauscht ist: sein Credentials-Provider erzwingt `strategy: 'jwt'`. Damit fällt die
  Datenbank-Sitzung weg, und mit ihr der Widerruf und `active` mit sofortiger Wirkung;
  Zurücksetzen, 2FA und Rate-Limit blieben trotzdem selbst gebaut. Übrig bliebe `authorize()`
  — unser argon2 und unsere Benutzersuche, also genau der Code, den der Wechsel loswerden
  sollte.
- **`app_user` und `session` behalten ihren Namen und jede Spalte.** `modelName` zeigt die
  Bibliothek auf unsere Tabellen statt umgekehrt. Nichts wird umbenannt (`user` ist in
  Postgres reserviert), und die vier zusammengesetzten Fremdschlüssel auf
  `app_user (id, tenant_id)` bleiben unberührt: `note.created_by`, `note.locked_by`,
  `note_draft.user_id`, `invoice_send.sent_by`.
- **Der argon2-Hash ist wörtlich umgezogen**, von `app_user.password_hash` nach
  `account.password`. Better Auth bekommt unsere eigenen `hashPassword`/`verifyPassword` als
  Parameter, hasht also nie selbst — deshalb war es eine Bewegung eines Strings und kein
  erzwungenes Zurücksetzen. Das Seed-Passwort gilt unverändert.
- **Der Mandant bleibt eine Spalte der Sitzungszeile.** `session.tenant_id` wird von
  `databaseHooks.session.create.before` aus der Benutzerzeile geschrieben, ist `not null` und
  trägt den zusammengesetzten Fremdschlüssel — eine Sitzung kann nur den Mandanten ihres
  eigenen Benutzers führen, und das sagt die Datenbank. Regel 1 bleibt wörtlich wahr, was bei
  einem JWT nicht so gewesen wäre.
- **Die Organisation wird später der Mandant, nicht ein zweiter Begriff.** Kommt das
  Organisations-Plugin, zeigt `organization: { modelName: 'tenant' }` es auf unsere Tabelle
  und `session: { fields: { activeOrganizationId: 'tenant_id' } }` auf unsere Spalte. Ein
  Begriff, zwei Namen, kein Umbenennen von dreißig Tabellen. Was dann wirklich umgebaut wird,
  ist `app_user.tenant_id` → `member`, und die vier Fremdschlüssel zeigen danach auf
  `member (user_id, organization_id)` — dieselbe Zusicherung, auf der dann zuständigen Tabelle.
  **`tenant.name` darf dabei nicht wiederbelebt werden**: das Plugin bringt `name` und `slug`
  mit, und die Entscheidung ist dann, dass `organization.name` `practice_settings.practice_name`
  *ersetzt* statt danebenzustehen (D7.5).
- **Das Theme-Cookie behält seinen Weg**: `hooks.after` auf `/sign-in/email` schreibt
  `praxi_theme` in **derselben Antwort** wie das Sitzungscookie. Das ist die ganze Mechanik und
  keine Bequemlichkeit — das Inline-Script in `index.html` liest es vor dem ersten Byte. Am
  Script hat sich nichts geändert, nur der Ort, an dem der Server das Cookie setzt.
- **Der Google-OAuth-Callback ist unberührt.** Er authentifiziert über den einmaligen `state`,
  hat nie ein Cookie gelesen und liegt unter `/api/google/oauth/callback`, also nicht in
  Kollision mit `/api/auth/*`.
- **Rate-Limit am Login**, in der Datenbank statt im Prozess: im Speicher wäre ein Neustart
  das billigste Zurücksetzen, das ein Angreifer bekommt. Fünf Versuche pro Minute auf
  `/sign-in/email`, gezählt **nach IP und nie nach Konto** — bei einer Behandlerin wäre ein
  Konto-Lockout ein Denial-of-Service gegen genau diese Person. Auch in der Entwicklung an: ein
  Limit, das nur in Produktion existiert, hat nie jemand arbeiten sehen. Die geplante Tabelle
  `login_attempt` entfällt ersatzlos.
- **`/api/auth/*` ist der eine Präfix in `PUBLIC_API_ROUTES`** und der einzige, den es geben
  wird. Er muss einer sein — die Unterpfade liegen im Router der Bibliothek und erreichen
  Honos Tabelle nie. Eingezäunt ist er durch eine Zusicherung: **unter `/api/auth/` darf keine
  Route von uns liegen.** `GET /api/auth/me` war bis hierher unsere und ist genau das, was ein
  Präfix sonst durchwinkt.
- **Was schlechter wird, benannt statt entdeckt:** der Sitzungstoken liegt im Klartext in der
  Datenbank (vorher nur sein sha256). Was ihn schützt, ist die Signatur des Cookies mit
  `BETTER_AUTH_SECRET` — ein Dump allein baut kein gültiges Cookie. Das umzudrehen hieße, eine
  eigene Sitzungsschicht an genau der Sicherheitsstelle zu schreiben, für die die Bibliothek
  geholt wurde.
- **Nicht gebaut, nur nicht verbaut:** `verification` ist angelegt und leer (Passwort-
  Zurücksetzen, E-Mail-Bestätigung), `account` trägt alle sechs OAuth-Spalten (Google-,
  Microsoft-Anmeldung), und 2FA braucht nichts als das Plugin — es bringt seine Tabelle und
  seine Spalte selbst mit.

### Was beim Bauen auffiel

- **Die `@better-auth/cli` ist unbrauchbar** — Version 1.4.21 gegen Bibliothek 1.7.2, und als
  „no longer supported" markiert. Stattdessen `getAuthTables()` aus der **installierten**
  Bibliothek fragen; die Funktion, die die CLI ohnehin nur einpackt. Nur so kamen
  `account.issuer` (`not null`, in keiner Doku) und der Unique-Index auf `(issuer, account_id)`
  statt `(provider_id, account_id)` heraus. Ohne den ersten wäre der `INSERT` der Migration
  gescheitert, ohne den zweiten hätte es niemand gemerkt bis zur ersten OAuth-Verknüpfung.
  Der Befehl steht als Kommentar in `0043_better_auth.sql`, samt der Anweisung, ihn nach jedem
  Update der Bibliothek laufen zu lassen.
- **`drizzle-kit generate` ist hier nicht mehr benutzbar.** Der Snapshot-Verlauf in
  `meta/` endet bei 0032, die Migrationen laufen bis 0042 — seit 0033 wird von Hand
  geschrieben, Journal-Eintrag inklusive. Ein Generierungsversuch legte `country`, `gender`
  und `note_type` neu an. 0043 ist deshalb von Hand geschrieben wie seine neun Vorgänger.
- **Der Drizzle-Adapter sucht Tabellen über den SCHLÜSSEL des Schema-Objekts**, nicht über den
  Tabellennamen. `schema` als Ganzes zu übergeben scheitert an `rate_limit` (der Export heißt
  `rateLimit`) — und wäre auch zu viel: übergeben werden genau die fünf Tabellen, die die
  Bibliothek anfassen darf, damit sie `contact` und `note` gar nicht erst erreichen kann.
- **`auth()` ist ein fauler Zugriff wie `db()` und `logger()`.** Ein `betterAuth({…})` auf
  Modulebene liest die Umgebung, bevor `index.ts` sie geladen hat. Und der Typ wird aus dem
  Builder **abgeleitet**: `ReturnType<typeof betterAuth>` weitet ihn auf den generischen
  Default und lässt `session.tenantId` und `user.active` still verschwinden — die zwei Felder,
  für die die Middleware existiert.
- **`routes/auth.test.ts` geht durch `auth().handler` mit echten `Request`s**, nicht durch
  `auth.api.*`: die Server-API umgeht den Rate-Limiter absichtlich, der wichtigste Test wäre
  also gegen nichts grün gewesen.

### Nachtrag: das Farbschema überlebte das Abmelden

Aufgefallen beim Durchklicken, nicht im Test. Der Server löschte `praxi_theme` korrekt — die
Antwort auf `/sign-out` trug `Max-Age=0` — und trotzdem blieb der Login-Screen in den Farben
dessen, der gerade gegangen war.

Der Grund ist, dass das Cookie nur den **nächsten vollständigen Seitenaufbau** entscheidet.
Abmelden navigiert clientseitig nach `/login`, ohne Neuladen; `applyTheme` läuft in
`_app.beforeLoad`, und `/login` liegt außerhalb von `_app`. Also setzte niemand das
`data-theme` am `<html>` zurück — es stand einfach weiter da.

`signOut` in `apps/web/src/lib/auth.ts` ruft jetzt `applyTheme(undefined)`. Beide Hälften von
„das Thema geht" sitzen damit in der Funktion, die nach der Handlung heißt: der Server das
Cookie, der Client das Attribut.

**Getestet ist nur die Server-Hälfte** (`routes/auth.test.ts`), und die hätte den Fehler nicht
gefunden — sie war schon grün. Das Web-Paket hat bewusst eine Art Test und keine
DOM-Umgebung; ein `jsdom` für diesen einen Fall wäre eine Abhängigkeit für eine Frage, die
`CLAUDE.md` an den Browser verweist. Was bleibt, ist der Kommentar an `signOut`, der sagt,
warum die Zeile dort steht.

## S-C1 — alles, was Row Level Security braucht, ohne es einzuschalten

Vorbereitung in einer Scheibe, damit S-C2 ein einziger Moment ist, in dem sich etwas ändern
kann, statt fünf. **Nichts an dieser Scheibe ist beobachtbar**: die Policies sind aus, der
Server verhält sich exakt wie vorher.

- **Der Befund, der den Rest bestimmte.** `praxi` ist Superuser, hat `BYPASSRLS` und ist
  Eigentümer aller 39 Tabellen — jeder der drei Gründe allein genügt, jede Policy zu umgehen.
  Nur Einschalten hätte **nichts** bewirkt, ohne Fehler und ohne Hinweis. Der Serverprozess
  verbindet sich jetzt als `praxi_app` (`APP_DATABASE_URL`), ohne Superuser, ohne Bypass, nicht
  Eigentümer; Migrationen, Seed und Skripte behalten `DATABASE_URL`. Das Passwort setzt
  `pnpm db:app-role` aus der Umgebung — in einer Migration hätte es im Git gestanden.
- **Alle 34 Policies waren falsch, auf dieselbe Weise.** `SET LOCAL` setzt eine eigene Variable
  am Transaktionsende nicht auf NULL zurück, sondern auf den **Leerstring**, und `''::uuid`
  wirft. `current_setting(…, true)` ist genau dafür gewählt, NULL statt Fehler zu liefern — und
  der Fall, der real eintritt, ist nicht Abwesenheit. Jetzt `nullif(…, '')`. Wäre erst im
  Betrieb aufgefallen, als Datenbankfehler statt leerer Antwort.
- **Drei Tabellen hatten RLS scharf und keine Policy** (`account`, `verification`,
  `rate_limit`, aus S-B). Das ist Default-Deny: null Zeilen für alle, die Anmeldung wäre tot
  gewesen.
- **`opening_hour` fehlte das `WITH CHECK`** — nachgeprüft und **kein Loch**: Postgres nimmt
  bei `FOR ALL` das `USING` auch als Check, ein Insert für einen fremden Mandanten wird
  refüsiert. Trotzdem vereinheitlicht.
- **Transaktion pro Anfrage, mit `SET LOCAL`.** Der Pool-Leak ist nachgestellt statt
  beschrieben, mit `max: 1`, was eine warme Verbindung ohnehin ist: bei `SET` sah die *nächste*
  Anfrage ohne eigenes Zutun die Zeilen des vorigen Mandanten; bei `SET LOCAL` null, auch nach
  einem Rollback. `middleware/tenant-db.ts` öffnet sie, Routen nehmen `database(c)` statt
  `db()` — 140 Aufrufstellen, alle in `routes/`.
- **Gesetzt wird dort, wo der Handle entsteht**, nicht in `withTenant`. Das ist ein Prüfpunkt
  ohne Datenbankhandle; dort gesetzt läge die Variable auf *irgendeiner* Verbindung, während
  die Route sich eine andere aus dem Pool greift.
- **Keine einzige Domänensignatur angefasst.** `Database` ist jetzt `Pool | Transaction` statt
  des Pools — was aus einer Route kommt, ist seit dieser Scheibe eine Transaktion, was aus Seed
  und Worker kommt, der Pool. Die 147 Signaturen waren immer richtig; `Database` hieß stets
  „etwas, worauf man Abfragen laufen lässt", und erst jetzt gibt es davon zwei.
- **Ein benanntes Loch, nicht zwei.** `google_connection_tenant_ids()`, `SECURITY DEFINER`,
  gibt eine Spalte einer Tabelle heraus — der Worker läuft auf einem Timer, hat keinen
  Mandanten, und ohne das fände er nichts, protokollierte nichts und sähe aus wie ein Worker
  ohne Arbeit. Der Rest läuft je Mandant über `asTenant()`, ebenso der OAuth-Callback, der
  seinen Mandanten aus dem `state` hat.
- **Der Entwurfs-Sweep wurde *keine* zweite solche Funktion.** Seine Regel ist „älter als 30
  Tage **oder** älter als die eigene Notiz"; das in SQL neben dem TypeScript zu wiederholen wäre
  eine zweite Definition davon, wann ein Entwurf veraltet ist. Er läuft jetzt für den Mandanten
  dessen, der sich anmeldet — ein Mandant, in den sich niemand anmeldet, sammelt auch keine
  neuen Entwürfe.
- **`tenantOfUser` hat einen eigenen Test** (`domain/session.test.ts`). Sie entscheidet, welcher
  Mandant überhaupt gilt, und liegt auf `app_user`, das absichtlich außerhalb der Policies
  bleibt — eine vergessene Filterung dort fiele nicht auf. Der zweite Test ist so gebaut, dass
  die erste Zeile der Tabelle absichtlich die falsche ist: ein `limit 1` ohne `where` fällt
  durch.
- **Die Geschwindigkeit ist gemessen, nicht geschätzt.** 200 000 Zeilen, Listenabfrage: 0,179 ms
  mit gegen 0,125 ms ohne — der Planer macht aus der Policy einen *One-Time Filter*, der
  Index-Scan bleibt identisch. Kindtabelle über den Elternschlüssel, 600 000 Zeilen, ohne
  eigenes `tenant_id` im `WHERE`: 0,109 ms, Index unverändert.
- **Nebenbefund in den Fixtures:** `createUser` leitete die E-Mail aus den ersten acht Zeichen
  der UUIDv7 ab — das ist der Zeitstempel, also kollidierten zwei in derselben Millisekunde
  angelegte Benutzer auf dem globalen Unique-Index. Fiel erst auf, als ein Test zwei brauchte.

## Before going live

Findings of a security review of the auth concept. Nothing here is built yet;
each line names the reason, not the solution.

- **A second test with two tenants and real data**, asserting that every route
  actually filters by `tenant_id`. `tenantId(c)` being the only sanctioned
  source says where the value comes from; it does not say that a handler used
  it, and one that forgets simply does not filter.
- **Decide and write down whether the database itself is encrypted.** Patient
  data currently sits unencrypted in Postgres, protected only by FileVault —
  which covers a stolen machine that is switched off and nothing else. This is
  a decision to take deliberately, not one to arrive at by default.
- **An access log, from the moment a second person has access.** With one user
  "who looked at this record" is answerable from the fact that there is one;
  with two it is not, and § 630f and Art. 9 GDPR make it a question that gets
  asked.
- **Enable the RLS policies** — S-C2, the one migration that flips them. S-C1
  did everything that has to be true first; this is `ALTER TABLE … ENABLE ROW
  LEVEL SECURITY` on 34 tables plus the two tests, and it is the one moment
  behaviour can change.
- **The seven routes that call a foreign service while holding the request
  transaction.** Six Google routes and the invoice mail send. Taken in hand in
  S-C1 rather than redesigned: `idle_in_transaction_session_timeout = '30s'` on
  the role bounds it, and one practitioner with ten connections is not where it
  becomes a correctness problem. The tidier shape is to read what is needed,
  commit, and only then talk to the network.
- **A deletion concept for the retention periods.** Records are kept because
  the law requires it for a time — nothing today marks when that time is up or
  removes anything afterwards, and keeping health data longer than the purpose
  allows is its own breach.
- **Squash the migration history into a single `pg_dump --schema-only`
  baseline**, per the rule under Conventions in `CLAUDE.md`. Deliberately not
  done for the Coolify deployment in slice 11 — that slice is the
  infrastructure step, not the point real patient data starts flowing
  through the system, and squashing is a one-way door with no benefit before
  then. Produce it from the actual running database, never regenerated from
  the Drizzle schema, so the hand-written parts — triggers, the `EXCLUDE`
  constraint, RLS policies, the ICU locale check, partial indexes — survive
  the squash.
- **Whether `practice_settings` needs a VAT id (`Umsatzsteuer-ID`).** The design
  prototype's "Praxis" section shows a field for it; the real schema has only
  `tax_number`. Not added retroactively as part of a layout pass (D4) — same
  reasoning as the invoice number-range prefix placeholders. Decide when it is
  actually needed, not before.
- **Handing treatment documentation out needs a second renderer for the note Markdown.**
  Auskunft nach Art. 15 DSGVO, Weitergabe an einen Nachbehandler, Aufbewahrung nach § 630f BGB
  beim Praxisende — das wird ein PDF, und `@react-pdf/renderer` versteht kein Markdown. Die
  Antwort ist ein zweiter Renderer auf dieselbe `Block[]`-Struktur aus
  `packages/shared/src/note-markdown.ts`, nicht eine Markdown-Bibliothek. Genau deshalb liegt
  der Parser in `packages/shared` und nicht im Frontend, und genau deshalb ist das Format auf
  fünf Konstrukte begrenzt: vier Blockarten im PDF nachzubauen ist ein Nachmittag, dreißig
  sind es nicht.
- **Point `contact_relation` at the id instead of at the code.** It is the last
  link in the schema that still references a catalogue by its `code`; the roles
  went to the id in migration 0035 and the activity types in B1/0041. Three
  tables, two patterns, for no reason anyone can name. Once it is done the code
  can leave practitioner-made relation types altogether — B1d derives one from
  the label today only because a foreign key cannot point at a NULL — and the
  check constraint "`is_system` requires a code" becomes possible, which is
  what would make an unanchored system entry unreachable rather than merely
  unlikely.

- **`themeOptions` (German: `schiefer`, `blau`, …) vs. `startPageOptions` (English:
  `overview`, `contacts`, …)** in `packages/shared/src/user-preferences.ts` — the same kind of
  enum, named two different ways, because `theme` predates identifiers being applied
  consistently to this file. Not touched retroactively; the migration squash is the point
  where straightening it would cost nothing extra, if it still bothers anyone by then.
