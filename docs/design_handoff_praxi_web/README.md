# Handoff: Praxi Web — Redesign Kontakte, Kalender, Vorgänge, Zahlungen, Leistungen, Einstellungen

## Überblick

Dieses Paket enthält den vollständigen Designstand des Praxi-Praxisverwaltungs-Frontends aus
der Designsitzung: Navigation, Kontaktliste, Kontaktdetail, Kontakt anlegen, Terminkalender,
Vorgänge, Zahlungen (inkl. Rechnungseditor), Leistungen und Einstellungen.

Zielcodebase: **`hendrikbeneke/praxi`, Branch `main`, Verzeichnis `apps/web/src`**
(React + TanStack Router, shadcn/ui im „new-york"-Stil, Tailwind). Die Screen-zu-Datei-Zuordnung
steht unten und in `github.md` im Projekt.

## Über die Design-Dateien

Die Dateien in `design/` sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und
Verhalten zeigen. Sie sind **kein Produktionscode zum Kopieren**. Sie laufen in einer eigenen
Laufzeit (`support.js`, Templates in `<x-dc>`), die im Zielprojekt nicht existiert und dort
nichts zu suchen hat.

Aufgabe: die gezeigten Screens **in der bestehenden Umgebung von `apps/web` nachbauen** — mit den
dort etablierten Mitteln (TanStack-Router-Routen, shadcn/ui-Komponenten aus
`apps/web/src/components/ui/`, Tailwind-Klassen, Texte über `apps/web/src/lib/strings.ts`).
Die Prototypen mounten dieselbe shadcn-Bibliothek, die das Repo verwendet (als gebündeltes
Design System). Wo im Prototyp `PraxiWeb.Button`, `PraxiWeb.Table`, `PraxiWeb.Select` steht,
ist das 1:1 die gleiche Komponente wie `@/components/ui/button` usw. im Repo.

Zum Ansehen: `design/*.dc.html` direkt im Browser öffnen (die mitgelieferten `_ds/`-Dateien,
`support.js` und `ds-base.js` müssen daneben liegen bleiben).

## Fidelity

**High-fidelity.** Farben, Typografie, Abstände, Radien, Zustände und Interaktionen sind final
gemeint. Der Nachbau soll visuell deckungsgleich sein, aber ausschließlich mit den Komponenten
und Utility-Klassen des Repos gebaut werden — nicht mit den Inline-Styles der Prototypen.
Inline-Styles im Prototyp sind eine Eigenheit der Design-Laufzeit, kein Stilvorbild.

## Design-Tokens

Alle Farben liegen als semantische CSS-Variablen in `theme.css` (in diesem Paket, kommentiert).
Übernahme ins Repo: Inhalt als `tokens.css` unter `:root` ablegen und **vor** dem Tailwind-Import
einbinden. Danach greifen `bg-background`, `text-muted-foreground`, `border-border` usw.

Grundwerte (Light, Standard-Thema „schiefer"):

| Token | Wert | Verwendung |
|---|---|---|
| `--background` | `oklch(98.2% .005 85)` | Seitenfläche, warmes Papierweiß |
| `--foreground` | `oklch(25% .012 62)` | Text |
| `--card` | `oklch(99.6% .003 85)` | Karten, Tabellenflächen |
| `--primary` | `oklch(37% .028 253)` | Primärbutton, „heute", aktive Zustände |
| `--primary-foreground` | `oklch(98.6% .004 85)` | Text auf Primär |
| `--secondary` | `oklch(95.2% .008 82)` | Badge „secondary" |
| `--muted` | `oklch(96.4% .006 82)` | Tabellenköpfe, ruhige Flächen |
| `--muted-foreground` | `oklch(52% .014 66)` | Labels, Hinweiszeilen, Sekundärtext |
| `--accent` | `oklch(94.4% .009 80)` | ausschließlich Hover |
| `--destructive` | `oklch(51% .15 27)` | Löschen, Fehler, Überfälligkeit |
| `--border` | `oklch(90.2% .008 80)` | Trennlinien |
| `--input` | `oklch(87.5% .009 80)` | Feldrahmen |
| `--ring` | `oklch(58% .03 253)` | Fokusring |
| `--sidebar` | `oklch(97% .006 85)` | Seitenleiste |
| `--radius` | `.5rem` | Radienbasis (`rounded-md` 6px, `-lg` 8px, `-xl` 12px) |

Varianten `blau`, `salbei`, `rose`, `nacht` liegen als `[data-theme=…]`-Blöcke in `theme.css`.
Sie sind Designexploration, kein Produktumfang — nur übernehmen, wenn Themenwahl gewünscht ist.

Typografie: **Source Sans 3**, Gewichte 400/600, selbst hosten (kein CDN).
`--font-sans` in `theme.css`. Zahlen in Tabellen und Formularen immer `tabular-nums`
(im Theme global für `table, input, [data-slot=badge]` gesetzt).

Abstände: Tailwind-Standardskala. Wiederkehrend: `gap-2`, `gap-3`, `gap-4`, `gap-6`,
Kartenpolster `px-6 py-4`, Abschnittsabstand `24px` vertikal, Formularraster
`grid-cols-12` mit `gap-4`/`gap-[18px]`.

## Durchgehende Muster (wichtiger als jeder Einzelscreen)

1. **Lesemodus zuerst.** Jedes Formular startet gesperrt und wird erst über „Bearbeiten"
   änderbar. Umsetzung im Repo wie bisher über `ReadModeFieldset` (`<fieldset disabled>`, sperrt
   auch Radix-Selects). Buttonzeile außerhalb des Fieldsets: im Lesemodus „Zuklappen" /
   „Bearbeiten", im Bearbeitungsmodus „Abbrechen" / „Speichern".
2. **Inline statt Dialog.** Listen (Rollen, Beziehungen, Vorgangsarten, Textbausteine,
   Mailvorlagen, Mailkonten, Leistungen, Leistungsgruppen, Rechnungen, Vorgänge) öffnen ihr
   Detail **in der Zeile darunter**, nicht in einem Modal. Zeile anklicken → Lesemodus,
   „Bearbeiten" → Formular. Dialoge bleiben Sonderfällen vorbehalten (Platzhalterübersicht,
   Sammelbestätigung, Notiz).
3. **Einheitliche Listenzeile.** Kopfzeile mit `bg-muted/40`, `text-xs uppercase tracking-wide
   text-muted-foreground`; Zeilen durch `border-t` getrennt; Karte mit `rounded-[10px] border
   overflow-hidden` (Rundung muss unten ebenfalls schneiden). Fehlende Werte immer als `—`,
   nie leer.
4. **Status als Punkt + Wort**, nicht als Badge: `<span>` 7×7 px, `rounded-full`,
   `bg-primary` bei aktiv / `bg-muted-foreground` bei inaktiv, daneben „Aktiv" / „Inaktiv" in
   `text-[12.5px] text-muted-foreground`. Aktiv/Inaktiv wird **nur im Bearbeitungsmodus**
   geschaltet.
5. **Inaktive Datensätze werden immer mitangezeigt.** Kein „Inaktive anzeigen"-Filter mehr —
   der Status steht in der Zeile.
6. **Reihenfolge über Pfeiltasten** (hoch/runter, 26×26 px, `text-muted-foreground`,
   Hover `bg-accent`) direkt in der Zeile, nicht per Drag & Drop.
7. **Keine Emoji, keine dekorativen Farbflächen.** Farbe trägt Bedeutung (Vorgangsart,
   Status, Überfälligkeit) oder gehört zur Primärfläche.

## Screens

### Navigation — `AppSidebar.dc.html`, `AppTopbar.dc.html`
Repo: `apps/web/src/routes/_app.tsx`

- Seitenleiste `bg-sidebar`, Breite 234 px, einklappbar (Icon-Button oben rechts in der
  Leiste). Kopf: „Praxi" 600, darunter Praxisname in `text-muted-foreground`.
  Einträge: Übersicht, Kontakte, Kalender, Vorgänge, Zahlungen, Leistungen, Einstellungen —
  je Icon 16 px + Label, aktiver Eintrag `bg-accent`, Höhe 36 px, `rounded-md`.
- Topbar: Breadcrumb links, globale Suche mittig-rechts (`⌘K`-Hinweis im Feld),
  Nutzermenü rechts (Initialen-Avatar, Name, Chevron) mit Abmelden.
- Einstellungsdialog der Topbar enthält: Startseite (Select), „Navigation eingeklappt starten"
  (Checkbox). **„Tagesübersicht per E-Mail" wurde entfernt** — nicht wieder einbauen.

### Kontaktliste — `Kontaktliste.dc.html`
Repo: `apps/web/src/routes/_app/contacts.index.tsx`, `components/ui/table.tsx`

Filterzeile, Rollen-Tabs, sortierbare Tabelle mit klebendem Kopf (nur der Tabellenkörper
scrollt — Verhalten wie in `table.tsx` bereits vorhanden). Spalten mit `tabular-nums` für
Kontaktnummer und Datumsangaben.

### Kontaktdetail — `Kontaktdetail.dc.html`
Repo: `components/contact-header.tsx`, `contact-overview.tsx`, `contact-form.tsx`,
`contact-relations.tsx`, `note-list.tsx`, `activity-list.tsx`,
`routes/_app/contacts.$contactId.tsx`

- Kopf: Name (24 px, 600), Nr., Alter; Rollen-Badges darunter; „Archivieren" rechts.
- Tabs: Übersicht, Stammdaten, Notizen, Vorgänge, Rechnungen.
- **Stammdaten** als zweispaltiges Raster: links Abschnittsspalte (200 px, Titel 600 +
  Erläuterung `text-[13px] text-muted-foreground`), rechts Felder im 12er-Raster,
  Abschnitte durch `border-t` und `padding: 24px 0` getrennt.
  Abschnitte: Name, Rollen, Person, Anschrift, Kontaktwege, Beziehungen, Notizfeld.
- **Rollen-Abschnitt (überarbeitet):**
  - Lesemodus: die zugeordneten Rollen als `Badge variant="secondary"` in einer Zeile,
    darunter eine Zeile `Nicht zugeordnet: …` in `text-[13px] text-muted-foreground`;
    ohne Rolle: „Keine Rolle zugeordnet."
    Ausdrücklich **keine deaktivierten Checkboxen** im Lesemodus — die waren unlesbar.
  - Bearbeitungsmodus: Checkboxen in **drei festen Spalten**
    (`grid-template-columns: repeat(3, minmax(150px, 220px))`, `gap: 12px 20px`),
    kein `auto-fit`. Rollen: Patienten, Angehörige, Zuweiser, Krankenkassen, Lieferanten.
- **Person-Abschnitt:** Feldreihenfolge **Geburtsdatum → Geburtsort → Geschlecht**
  (je 4 von 12 Spalten). Geburtsdatum über `DateField`.
- Beziehungen: Tabelle mit Inline-Bearbeitung der Zeile (Art, Gegenstück, Kontaktsuche).
- Notizen-Tab: Liste + Lesespalte mit Inline-Editor (`note-list.tsx`).
- Vorgänge-Tab: Liste mit aufklappbarem Detail, Positionen, Termin, Notiz
  (`activity-list.tsx`, `activity-dialog.tsx` als Vorlage, jetzt inline).
- Rechnungen-Tab: Liste mit Lese-/Bearbeitungsmodus je Rechnung.

### Kontakt anlegen — `Kontakt anlegen.dc.html`
Repo: `routes/_app/contacts.new.tsx`, `components/contact-form.tsx`

Eigener Screen (kein Dialog): Seitentitel + „Die Kontaktnummer wird beim Speichern vergeben.",
„Zurück" rechts, leeres Formular in derselben Abschnittsstruktur wie Stammdaten,
klebende Fußzeile mit „Abbrechen" / „Kontakt anlegen".
Rollen hier als Checkboxen (Anlage ist immer Bearbeitungsmodus).
Feldreihenfolge im Person-Abschnitt ebenfalls **Geburtsdatum → Geburtsort → Geschlecht**.

### Terminkalender — `Terminkalender.dc.html`
**Neu in diesem Redesign — im Repo existiert noch keine Route dafür.**
Vorschlag: `routes/_app/calendar.tsx` + `components/calendar-*.tsx`.

Dreispaltiges Layout: linke Spalte (Mini-Monat + „Freien Termin finden"), Kalenderfläche,
rechte Spalte (Tagesüberblick bzw. Termin-Detail bzw. Neuanlage).

- **Ansichten:** Tag, Arbeitswoche, Woche, Monat, Liste (Segmented-Buttons über dem Raster),
  dazu „Heute" und Pfeile. Zeitraster 30 Minuten, Termine per Drag & Drop verschiebbar.
- **Mini-Monat:** Klick auf einen Tag setzt das Datum (`anker`) und hebt den Tag hervor
  (heute gefüllt `bg-primary`, gewählter Tag getönt `color-mix(in oklab, var(--primary) 20%, transparent)`,
  Gewicht 700). Die Ansicht oben **wechselt dabei nicht** — Arbeitswoche bleibt Arbeitswoche.
  Punkt unter der Zahl, wenn der Tag Termine hat.
- **Tagesüberblick rechts** folgt dem gewählten Tag, solange er im angezeigten Zeitraum liegt,
  sonst heute, sonst erster Tag des Zeitraums. Inhalt: Wochentag + Datum, drei Kennzahlen
  (Termine, belegt in h, Absagen), Karte „Nächste freie Zeit" mit „Termin dort anlegen",
  darunter „Ablauf" — Uhrzeit, Farbstrich der Vorgangsart, Kontakt, Dauer.
- **Monatsansicht:** Klick auf einen Termin öffnet das Termin-Detail (Klick darf **nicht** an
  die Tageszelle durchlaufen). Klick auf freie Fläche einer Tageszelle wählt den Tag und zeigt
  dessen Tagesüberblick — **niemals** eine Neuanlage.
- **Termin-Detail (rechte Spalte):**
  - Kein Umschalter „Nur Termin / Vorgang mit Termin" — ein angelegter Termin lässt sich
    nachträglich nicht umstellen. Ob ein Vorgang dahinter liegt, zeigt der Hinweistext bzw.
    der Vorgangslink.
  - Felder: Art (nur wenn Vorgang), Datum + Status in einer Zeile, darunter
    **Von, Bis, Dauer** in einer Zeile zu dritt. „Bis" = Beginn + Dauer; Eingabe in „Bis"
    setzt die Dauer (Minimum 5 Minuten).
  - Lesemodus gesperrt, „Bearbeiten" schaltet frei; Fußzeile „Abbrechen"/„Speichern",
    zusätzlich „Absagen".
  - **Zeiteingabe:** Der getippte Rohtext muss sichtbar bleiben, auch wenn er noch keine
    gültige Zeit ist (`bisText`-Zwischenzustand); erst bei gültigem `HH:MM` wird die Dauer
    nachgezogen, beim Verlassen springt das Feld auf den berechneten Wert zurück.
    Eine Validierung, die nur vollständige Werte übernimmt, fühlt sich eingefroren an.
- **Neuanlage (rechte Spalte, „NEUER EINTRAG"):**
  - Umschalter „Vorgang mit Termin" / „Nur Termin" oben.
  - Kontakt (Suche, Label „Kontakt (optional)").
  - „Vorgang mit Termin": Art (Select mit Dauer im Label, z. B. „Folgesitzung · 45 Min"),
    Status des Vorgangs, Bezeichnung (optional), Datum, dann **Von + Dauer** — kein „Bis",
    die Dauer kommt aus der Art und ist überschreibbar. Darunter Positionen (Katalogauswahl,
    Menge × Betrag, Entfernen) und „Abrechenbar"-Summe, Notiz.
  - „Nur Termin": kein Art-Feld (ohne Vorgang gibt es keine Art), Datum, dann
    **Von + Bis + Dauer**; Bis und Dauer sind beide eintragbar und halten sich gegenseitig
    aktuell. Die Dauer ist eine **reine Zahl**, die Einheit steht im Label: „Dauer (Min)".
  - Kollisionshinweis in `text-destructive`, wenn die Zeit überlappt.
- **„Freien Termin finden"** (linke Spalte): Vorgangsart wählen (Farbpunkt + Name + Dauer) oder
  freie Dauer (15/30/60 Min); danach markiert der Kalender alle passenden Lücken, Klick darauf
  legt direkt einen Vorgang mit Termin an. Hinweiszeile darunter erklärt den Zustand.

### Vorgänge — `Vorgänge.dc.html`
Repo: `routes/_app/activities.tsx`, `components/activity-list.tsx`, `activity-dialog.tsx`

Zeitraum- und Statusfilter, Zeile mit Kontaktnamen, Detail inline mit „Bearbeiten".

### Zahlungen — `Zahlungen.dc.html`, `RechnungEditor.dc.html`
Repo: `routes/_app/billable.tsx`, `invoices.index.tsx`, `receivables.tsx`,
`components/collect-dialog.tsx` — **drei bisherige Seiten werden zu einer.**

- Zwei Reiter: **Offene Vorgänge** (nach Kontakt gruppiert, Positionsauswahl,
  „Entwurf erstellen") und **Rechnungen** (alle Zustände).
- Kacheln oben: die Reiter tragen je zwei Zeilen. Zeile 1 der Vorgangs-Kachel:
  `„1 Entwurf · 3 offen"`. Zeile 2: Warnhinweis zu überfälligen Rechnungen.
- Statusfilter als Chips mit Anzahl, Reihenfolge:
  **Alle, Entwurf, Offen, Überfällig, Bezahlt, Storniert**.
  „Überfällig" = gestellte Rechnung, deren Zahlungsziel (Rechnungsdatum + Zahlungsziel,
  Standard `ZIEL_TAGE`) vor heute liegt.
- Rechnungseditor inline in der Liste: Empfängersuche, Diagnose, Leistungszeitraum,
  Positionen, Summen; Aktionen „Festschreiben" und „Betrag erhalten".

### Leistungen — `Leistungen.dc.html`, `LeistungForm.dc.html`
Repo: `routes/_app/services.tsx`

Zwei Reiter: Leistungen (Katalog) und Leistungsgruppen. Beide als **eine Karte** im
gemeinsamen Listenmuster:

- Katalog-Kopfzeile: Kürzel (58 px), Bezeichnung (1fr), Ziffer (48 px), Preis (76 px, rechts),
  Dauer (80 px), Status (66 px), zwei Pfeilspalten (je 26 px).
  Zeile: Klick öffnet das Detail inline darunter; Dauer ohne Wert `—`;
  Status als Punkt + Wort; Pfeile sortieren innerhalb der vollen Liste.
- Gruppen-Kopfzeile: Gruppe (150 px), Enthalten (1fr, „2× Ergotherapie, 1× …"),
  Anzahl (96 px), Summe (84 px, rechts, 600), Status, zwei Pfeilspalten.
- Kein „Inaktive anzeigen" — inaktive stehen mit in der Liste.
- Löschen ist gesperrt, solange eine Leistung in einer Gruppe verwendet wird.

### Einstellungen — `Einstellungen.dc.html`, `ListenForm.dc.html`, `BausteinForm.dc.html`
Repo: `routes/_app/settings.tsx`

Bereichsspalte links: Praxis, Rechnungsstellung, Rollen, Beziehungen, Vorgangsarten,
Textbausteine, Mailversand (Mailkonten + Mailvorlagen), Google-Kalender.
Alle Listenbereiche folgen dem Muster aus „Durchgehende Muster": Zeile anklicken → Lesemodus,
„Bearbeiten" → Formular mit „Abbrechen"/„Speichern", inline statt Dialog.

- **Rechnungsstellung:** Nummernkreise mit Präfix; unter dem Präfix-Feld die verfügbaren
  Platzhalter als `<code>`-Chips (`YYYY`, `YY`, `MM`, `M`, `Q` mit Bedeutung).
  Achtung: das ist eine **andere** Liste als die Mailplatzhalter — beide dürfen nicht dieselbe
  Variable teilen (war ein Fehler; die Präfix-Zeile zeigte sonst Mailplatzhalter ohne Kürzel).
- **Beziehungen:** Checkbox „Einseitig" (invertiert zu Beidseitig); das Feld „Gegenstück"
  erscheint nur, wenn „Einseitig" **nicht** angehakt ist. Aktiv-Status im Lesemodus als
  Punkt + Wort, geschaltet nur im Bearbeitungsmodus.
- **Vorgangsarten:** Kürzel, Status, Dauer (Minuten), Farbe, Vorbelegung — fehlende Werte `—`.
  Vorbelegbare Leistungen mit Reihenfolge und Entfernen, gleicher Picker wie in der
  Kontaktakte (Leistungen + Leistungsgruppen). Farbwahl: Farbkreis in der Spalte, daneben
  „im Kalender", Klick öffnet einen `input[type=color]`.
- **Mailkonten:** Lesemodus mit „Bearbeiten"; Benutzername und Passwort nebeneinander.
  Passwort im Formular leer mit Platzhalter „unverändert lassen", im Lesemodus Punkte.
- **Mailvorlagen:** Lesemodus zeigt Betreff und Text. Textfeld im Formular mit Hinweis
  „Platzhalter verwenden" und Link „Platzhalter ansehen" → Dialog mit allen Platzhaltern
  (`{{number}}` = Rechnungsnummer usw.).

## Interaktionen und Verhalten (querschnittlich)

- Hover ausschließlich über `--accent`; keine Schatten-Hover.
- Fokus: Ring über `--ring`, shadcn-Standard.
- Klick auf einen Eintrag in einer Liste toggelt: erneuter Klick klappt zu.
- Verschachtelte Klickziele brauchen `stopPropagation` **und** dürfen den Elternhandler nicht
  auslösen (siehe Monatsansicht: Termin vs. Tageszelle).
- Zahlen rechtsbündig und `tabular-nums`, Beträge im Format `1.234,56 €`, Datum `DD.MM.YYYY`,
  Zeit `HH:MM`, Dauer als Zahl + „Min".
- Leerzustände als ein Satz in `text-muted-foreground` („Noch keine Leistungen im Katalog.",
  „Keine Termine.").

## Zustand

Die Prototypen halten Zustand lokal; im Repo gehört er in die vorhandene Datenschicht.
Erkennbare Zustandsträger je Screen:

- Kalender: `ansicht`, `anker` (gewählter Tag), `miniAnker` (Mini-Monat), `wahl` (Termin-ID),
  `entwurf` (Neuanlage), `bearbeiten`, `formular` (Bearbeitungswerte), `bisText`
  (Roh-Eingabe der Bis-Zeit), `freiArt` / `freiDauer` / `freiAktiv` (Freie-Zeit-Suche).
- Kontaktdetail: `tab`, `editing`, `rollen`, Stammdatenfelder, `vgWahl` / `vgBearbeiten` /
  `vgDaten` (Vorgangsdetail), `rdWahl` / `rdEdit` (Rechnungsdetail), `notiz` (Dialog),
  `bezZeile` (Beziehungszeile in Bearbeitung).
- Zahlungen: aktiver Reiter, Statusfilter, ausgewählte Positionen, Rechnungsentwurf.
- Leistungen/Einstellungen: `offen` (geöffnete Zeile), `bearbeiten`, Formularwerte,
  Reihenfolge der Listen.

## Assets

Keine Bilder. Alle Icons sind inline-SVG im Lucide-Stil (`stroke-width` 1.8–2,
`stroke-linecap="round"`) — im Repo die vorhandene Lucide-Bindung verwenden.
Schrift: Source Sans 3 (400/600), selbst hosten; Dateien liegen in
`design/_ds/…/fonts/`.

## Dateien in diesem Paket

| Datei | Inhalt |
|---|---|
| `theme.css` | Design-Tokens, kommentiert, inkl. Themenvarianten |
| `design/AppSidebar.dc.html`, `design/AppTopbar.dc.html` | Navigation |
| `design/Kontaktliste.dc.html` | Kontaktliste |
| `design/Kontaktdetail.dc.html` | Kontaktdetail mit allen Tabs |
| `design/Kontakt anlegen.dc.html` | Anlage-Screen |
| `design/Terminkalender.dc.html` | Kalender, alle fünf Ansichten (neu) |
| `design/Vorgänge.dc.html` | Vorgänge-Übersicht |
| `design/Zahlungen.dc.html`, `design/RechnungEditor.dc.html` | Zahlungen, Rechnungseditor |
| `design/Leistungen.dc.html`, `design/LeistungForm.dc.html` | Leistungskatalog und Gruppen |
| `design/Einstellungen.dc.html`, `design/ListenForm.dc.html`, `design/BausteinForm.dc.html` | Einstellungen |
| `design/_ds/`, `design/support.js`, `design/ds-base.js` | Laufzeit der Prototypen, nur zum Ansehen |
| `screenshots/` | Aufnahmen aller Screens (Reihenfolge siehe unten) |

### Screenshots

| Datei | Screen / Zustand |
|---|---|
| `01-kontaktliste.png` | Kontaktliste |
| `02-kontaktdetail.png` | Kontaktdetail, Stammdaten im Lesemodus (Rollen als Chips) |
| `03-kontakt-anlegen.png` | Kontakt anlegen |
| `04-terminkalender-arbeitswoche.png` | Kalender, Arbeitswoche mit Tagesüberblick |
| `05-terminkalender-monat.png` | Kalender, Monatsansicht |
| `06-terminkalender-liste.png` | Kalender, Listenansicht |
| `07-vorgaenge.png` | Vorgänge-Übersicht |
| `08-zahlungen-offene-vorgaenge.png` | Zahlungen, Reiter „Offene Vorgänge" |
| `09-zahlungen-rechnungen.png` | Zahlungen, Reiter „Rechnungen" mit Statusfiltern |
| `10-leistungen-katalog.png` | Leistungen, Katalog |
| `11-leistungsgruppen.png` | Leistungen, Leistungsgruppen |
| `12-einstellungen-praxis.png` | Einstellungen, Praxis |
| `13-einstellungen-vorgangsarten.png` | Einstellungen, Vorgangsarten |
| `14-einstellungen-mailversand.png` | Einstellungen, Mailversand |

Die Screenshots sind DOM-Aufnahmen; die Hausschrift ist darin durch eine Systemschrift ersetzt.
Für Typografie gilt `theme.css`, nicht das Bild.

## Reihenfolge für die Umsetzung

1. `theme.css` als `tokens.css` ins Repo, vor dem Tailwind-Import — danach stimmen alle Farben.
2. Querschnittliche Muster einmal sauber bauen: Listenkarte mit Kopfzeile, Statusanzeige
   Punkt + Wort, Reihenfolge-Pfeile, Inline-Detail mit Lese-/Bearbeitungsmodus.
   Diese vier Bausteine tragen Leistungen, Einstellungen, Zahlungen und Vorgänge.
3. Bestehende Screens angleichen: Kontaktdetail (Rollen, Feldreihenfolge), Leistungen,
   Einstellungen, Zahlungen (Überfällig-Filter, Kachelzeilen).
4. Kalender neu bauen — der größte Posten, mit den oben beschriebenen Klick- und
   Zeiteingabe-Regeln als Akzeptanzkriterien.
