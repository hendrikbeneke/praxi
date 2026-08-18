# Design-Abgleich D3 – D9.5

> **Abgeschlossen.** Was aus jeder Zeile geworden ist — behoben in welchem Paket, bewusst offen,
> oder als Fehlbefund zurückgenommen — steht in [`ABSCHLUSS.md`](ABSCHLUSS.md). Diese Datei
> bleibt der Befundstand vom Abgleichdurchgang und wird nicht nachgeführt.


Ein reiner Vergleichsdurchgang: Prototyp gegen gebaute Oberfläche, Bildschirm für
Bildschirm. Nichts an der Anwendung wurde geändert. Maßstab ist ausdrücklich
umgekehrt zu den Bau-Paketen: **der Prototyp gilt, bis eine Regel ihm konkret
widerspricht.** Wo eine Abweichung in `WORKPLAN.md` besprochen und begründet
wurde, steht die Stelle dabei. Alles andere ist Versehen.

## Wie gemessen wurde

Beide Seiten in Chromium, Viewport **1440 × 950**, DPR 2, helles Standardschema
(„schiefer"), Locale `de-DE`, Zone `Europe/Berlin`.

Der Vergleich ist belastbar, weil die Grundlage nachgemessen ist:

| | Prototyp | Gebaut |
|---|---|---|
| `--background` | `oklch(98.2% .005 85)` | `oklch(98.2% 0.005 85)` |
| `--primary` | `oklch(37% .028 253)` | `oklch(37% 0.028 253)` |
| `--radius` | `.5rem` | `0.5rem` |
| Schrift | Source Sans 3, geladen | Source Sans 3, geladen |

Jede Farb- und Typografieabweichung unten ist damit echt und kein Artefakt.

**Zwei Fallen, beide beim ersten Versuch zugeschnappt:**

1. Der Prototyp lädt `theme.css` relativ zu `design/`, die Datei liegt aber eine
   Ebene höher im Paket. Wer die Prototypen so öffnet, wie das Handoff-README es
   sagt, bekommt sie **ungestylt**. Für diesen Durchgang wurde das Paket
   gespiegelt und `theme.css` danebengelegt (`curl` gegen `/design/theme.css`
   liefert 200, bevor irgendetwas aufgenommen wird).
2. Die Gegenüberstellungen entstanden zuerst über `page.setContent()` mit
   `<img src="file://…">`. Das Dokument hat dann den Ursprung `about:blank`, und
   Chromium lädt aus einem Nicht-`file`-Ursprung keine `file://`-Unterressourcen —
   **22 Bilder mit zwei Bruchsymbolen auf dunklem Grund, ohne eine einzige
   Fehlermeldung.** Die Bilder werden jetzt als `data:`-URI eingebettet, und der
   Komponierer bricht ab, wenn `naturalWidth` eines der beiden Bilder nicht über
   500 liegt.

### Was tatsächlich angesehen wurde

Jeder Bildschirm dieses Berichts wurde auf **beiden** Seiten als Bild geöffnet und
gelesen — nicht nur erzeugt. Befunde stehen nur dort, wo das der Fall ist; die
Ursachenangaben (`grid-cols-[…]`, `ChevronUp`, `formatRelativeBerlin`, `px-8 py-8`)
sind anschließend im Quelltext bestätigt worden, nicht aus ihm erschlossen.

`vergleich/` enthält 22 Paare, links Prototyp, rechts gebaut, beide in nativer
Auflösung nebeneinander.

### Was den Vergleich begrenzt

Die Entwicklungsdatenbank ist dünn (5 Kontakte, 10 Vorgänge, 0 Öffnungszeiten),
der Prototyp zeigt eine volle Praxis. Wo unten „datenbedingt" steht, ist die
Abweichung **nicht beurteilbar**, nicht etwa keine. Betroffen: Zahlungen →
Offene Vorgänge (leer), jede Überfällig-Darstellung, die Notiz-Formatierung.

---

## Die gemeinsamen Gründe

Fünf Stellen erklären fast alle Befunde.

### 1. Die Seitenhülle hat keine Inhaltsbreite und zu viel Kopfabstand

`routes/_app.tsx:42` — `<main className="min-w-0 flex-1 overflow-auto px-8 py-8">`

Der Prototyp deckelt jeden Bildschirm — `max-width:1180px` (Einstellungen,
Leistungen, Vorgänge, Zahlungen, Kalender), `1000–1100px` (Kontaktdetail,
Anlegen), ungebremst nur die Kontaktliste — und polstert oben **20–26 px**.
Gebaut: 32 px oben, **keine** Breitenbegrenzung, nirgends. Auf einem breiteren
Monitor läuft der Inhalt beliebig auseinander.

### 2. `PageHeader` ist zu klein und hat keinen dritten Slot

| | Prototyp | Gebaut |
|---|---|---|
| Größe | 26 px | 24 px (`text-2xl`) |
| Zeilenhöhe | 28,6 px (1.1) | **32 px** |
| Laufweite | −0.022em | −0.025em |

Die Zeilenhöhe ist der sichtbarere Fehler. Dazu kennt die Komponente nur `title`
und `description` — der Prototyp hat auf mehreren Bildschirmen eine **dritte
Zeile** (13 px, max. 720 px). Weil dafür kein Platz war, ist sie bei Leistungen
in die Karte gewandert und hat den Knopf mitgenommen.

### 3. Die Listenkopfzeile ist eine Stufe zu groß

`components/list-card.tsx` — 12 px statt 11 px, Laufweite 0,3 statt 0,22 px,
Kopfhöhe **49 statt 35,5 px**. Die Fläche stimmt (`bg-muted/40`, beide lösen zu
`oklch(.983 …)` auf), die Schrift nicht.

### 4. Lesemodus zeigt Eingabefelder statt Werten

Kontaktakte, Einstellungen/Praxis, Mailkonto — überall. Der Prototyp rendert
**reinen Text** unter dem Label; gebaut sind es deaktivierte Kästen mit Rahmen,
und leere Kästen dort, wo nichts hinterlegt ist.

**Hier widerspricht eine Regel dem Prototyp — aber nur halb.** CLAUDE.md nennt
`ReadModeFieldset` als Umsetzung; das Handoff sagt für den Rollen-Abschnitt
ausdrücklich „**keine deaktivierten Checkboxen** im Lesemodus — die waren
unlesbar", und dieselbe Begründung trägt für Textfelder. Die Repo-Regel verlangt,
dass Lesen nichts ändern kann, nicht dass ein Wert wie ein Feld aussieht.
**Das ist die Entscheidung, die ich dir vorlege und nicht selbst treffe.**

### 5. Über jeder Liste fehlt die Zusammenfassungs- und Filterzeile

Das ist der Befund, der sich am häufigsten wiederholt, und er ist mir im ersten
Durchgang durchgerutscht:

| Ort | Prototyp | Gebaut |
|---|---|---|
| Leistungen, beide Reiter | `Leistungen 9` / `Leistungsgruppen 3` | ohne Zähler |
| Zahlungen → Rechnungen | `9 Alle · 1 Entwurf · 3 Offen …` | Chips ohne Zahlen |
| Kontaktakte → Notizen | `4 Notizen · 3 Gesperrt · 1 Offen · 2 Sitzung …` | **fehlt ganz** |
| Kontaktakte → Vorgänge | `8 Vorgänge · 3 kommend · 3 Geplant · 4 Stattgefunden …` | **fehlt ganz** |
| Kontaktakte → Rechnungen | `3 Rechnungen · 1 Offen · 1 Bezahlt · 1 Überfällig` | **fehlt ganz** |

Dazu, in den Einstellungen, dieselbe Bewegung in zwei Richtungen:

- **Jede Listenkarte hat ihren erklärenden Schlusssatz verloren** — Rollen
  („Ein System-Eintrag lässt sich umbenennen, aber nicht löschen …"), Beziehungen
  („Der erste Kontakt ist der, in dessen Akte …"), Vorgangsarten („Inaktive Arten
  erscheinen in keiner Auswahlliste …"). Drei von drei.
- **Jede Listenkarte hat eine Spaltenkopfzeile bekommen, die der Prototyp nicht
  hat** — Rollen, Beziehungen, Vorgangsarten, Mailvorlagen. Vier von vier, jeweils
  mit leerer erster Zelle.

---

## Je Bildschirm

**A** = Absicht, im Plan besprochen · **V** = Versehen

### D3 — Navigation

- **V** Die **globale Suche in der Kopfzeile fehlt ersatzlos**. Handoff: „globale
  Suche mittig-rechts (`⌘K`-Hinweis im Feld)". Im Repo existiert kein String
  „durchsuchen"; der D3-Eintrag beschreibt die Kopfzeile ohne sie und begründet
  nichts.
- **V** Zweite Breadcrumb-Ebene fehlt außerhalb der Kontakte („Einstellungen /
  Praxis", „Einstellungen / Vorgangsarten" im Prototyp). Für die
  Einstellungsbereiche nie besprochen — und deren Bereich steht ohnehin im
  URL-Suchparameter.
- **A** Checkbox „Navigation eingeklappt starten" entfällt · Konto-Dialog als
  `Dialog` · „Termine" → „Kalender" (alle D3).
- **Layout:** Seitenleiste 233 gegen 235 px, Eintragshöhe 34 gegen 35, Kopfzeile
  beide 56, aktiver Eintrag beide `oklch(.944 .009 80)`, Radius beide 6 px.
  **Der genaueste Nachbau im ganzen Paket.**

### D4 — Einstellungen

**Praxis**

- **V** **Eine Karte ist in fünf zerfallen.** Prototyp: eine Karte
  „Praxisstammdaten", darin fünf Abschnitte im 200-px-Titelspalten-Raster,
  linienweise getrennt. Gebaut: fünf gleichrangige Karten ohne Titelspalte — genau
  das Raster, das D6 für die Kontaktakte gebaut hat, fehlt hier.
- **V** Alle Abschnittserläuterungen fehlen („Der Name steht auf jeder Rechnung.",
  „Erscheint im Briefkopf, wenn keine Vorlage hinterlegt ist." …).
- **V** Lesemodus als Feldkästen (Ursache 4).
- **A** Keine USt-ID (D4: „siehe Before going live").

**Rechnungsstellung**

- **V** Die **Nummernkreis-Tabelle ist zu zwei gestapelten Formularen geworden.**
  Prototyp: eine Tabelle, Kopfzeile `KREIS · PRÄFIX · STELLEN · NÄCHSTE NUMMER ·
  VORSCHAU`, eine Zeile je Kreis. Gebaut: zwei Blöcke, die alle vier Labels
  wiederholen, jeder mit eigenem „Bearbeiten".
- **A** Präfix-Platzhalter-Chips nicht gebaut (D4) · Textbausteine als eigener
  Bereich (D4) · Zahlungsziel hierher gezogen (D4).

**Rollen / Beziehungen / Vorgangsarten / Mailvorlagen** — siehe Ursache 5
(Schlusssatz weg, Spaltenkopf dazu). Zusätzlich:

- **V** Vorgangsarten: **Farbkreis ist ein Farbklotz.** Handoff: „Farbkreis in der
  Spalte". Gebaut ein gefülltes Rechteck mit den ersten drei Buchstaben („Ers",
  „Fol", „Vor") in Weiß — `ColorSwatch`, `activity-type-settings.tsx:228`,
  `label.slice(0, 3)`. Lautestes Element des Bildschirms, gegen Muster 7 („keine
  dekorativen Farbflächen").
- **V** Vorgangsarten: **Vorbelegung steht nicht mehr in der Zeile** (Prototyp:
  „60 Minuten · Erstgespräch mit Anamnese"; gebaut nur „12 Minuten"), und fehlende
  Dauer wird **gar nicht** dargestellt statt als `—` bzw. „ohne übliche Dauer".
- **V** Beziehungen: Prototyp erklärt die Richtung in Worten („Gegenstück: Kind
  von", „Gilt in beide Richtungen gleich"); gebaut steht dort „Sorgeberechtigt ↔
  Sorgeberechtigt für" — Pfeilnotation statt Satz.
- **V** Aktiver Bereich links: `bg-primary/10` (`settings.tsx:102`) statt der
  neutralen grauen Fläche.
- **V** Bereichshinweise links **umbrechen auf zwei bis drei Zeilen**, weil die
  Texte länger sind als die einzeiligen des Prototyps.
- **A** `RadioGroup` statt Checkbox „Einseitig" · Mengenfeld in der Vorbelegung
  (beide D4).

**Mailkonto**

- **V** „Bearbeiten" ist vom **Kartenkopf** an den **Kartenfuß** gewandert, in eine
  Reihe mit „Testmail senden" und „Mailkonto entfernen".

**Google-Kalender**

- **V** Der Statusstreifen ist vom **Kopf** an den **Fuß** gewandert, hat seine
  versalen Kleinlabels verloren und ist von **drei auf zwei** Felder geschrumpft:
  `LETZTER FEHLER` fehlt im fehlerfreien Zustand. Ob es im Fehlerfall erscheint,
  ist hier nicht prüfbar — nach Regel 13 muss es das.
- **V** „Zuletzt synchronisiert: **heute, 07:40**" gegen „16.08.2026, 23:19" —
  absolut statt relativ, dieselbe Familie wie die Termin-Spalte der Kontaktliste.

### D5 — Leistungen

- **V** Erläuterungssatz **und** „Neue Leistung" sind aus dem Seitenkopf in die
  Karte gerutscht (Folge von Ursache 2). Der Prototyp beginnt die Karte direkt mit
  der Kopfzeile.
- **V** Reiter ohne Zähler, und als Segmentcontrol statt runder Einzelchips.
- **V** **Der Spaltenkopf „STATUS" fehlt — auf beiden Reitern.** Ursache in
  `service-list.tsx:51`: `grid-cols-[58px_minmax(0,1fr)_48px_76px_80px]`, **fünf**
  Spalten. Handoff gibt sieben vor: 58 / 1fr / 48 / 76 / 80 / **66 (Status)** /
  **26 + 26 (Pfeile)**. Status und Pfeile hängen außerhalb des Rasters.
- **V** Kopfzeile 49 statt 35,5 px; „ZIFFER (GEBÜH)" bricht um, wo der Prototyp
  „ZIFFER" schreibt. Zeilentext erbt 16 px, wo der Prototyp 14 px setzt.
- **V** **Chevrons statt Pfeilen** (`catalogue-controls.tsx:1`) und **36 × 36 px**
  statt der vorgegebenen **26 × 26 px**. Muster 6 sagt „Pfeiltasten".
- **A** Grid statt `<Table>` · Löschen reaktiv · Anlegen einheitlich (alle D5).

### D6 — Kontaktbereich

**Kontaktliste**

- **V** Die Filterzeile ist **keine Karte mehr und in zwei Zeilen zerfallen**, mit
  sichtbaren Labels „Suchen" und „Weitere Rollen", die der Prototyp nicht hat.
  „Weitere" ist dort ein Reiter mit Chevron in derselben Reiterzeile.
- **V** Fußzeile „45 von 214 angezeigt · Seitengröße 50" fehlt.
- **V** Spalte **Nr. linksbündig** statt rechtsbündig; **Name nicht in 600**.
- **V** **Termin-Spalte zeigt denselben Zeitpunkt zweimal absolut**: „12.08.2026,
  22:26" über „Mi., 12.08. 22:26". `formatRelativeBerlin` fällt jenseits von
  ±1 Tag bewusst auf „Mo, 24.08. 09:00" zurück (`datetime.ts:185`) — für sich
  sinnvoll, neben `formatBerlinDateTime` aber doppelt. Prototyp: „Mo, 17.08. ·
  09:30" und daneben gedämpft „in 6 Tagen", einzeilig, immer relativ.
- **A** Keine Zähler an den Rollen-Reitern · Terminspalte nicht in der
  Spaltenauswahl (beide D6).

**Kontaktakte — Kopf und Stammdaten**

- **V** **Der „Rollen"-Abschnitt fehlt.** Das Handoff spezifiziert ihn in zwei
  Modi (Lesemodus Badges + „Nicht zugeordnet: …"; Bearbeiten Checkboxen in drei
  festen Spalten). Gebaut gibt es Rollen nur als Chip im Kopf.
- **V** **Feldreihenfolge falsch** — vorgegeben Geburtsdatum → Geburtsort →
  Geschlecht (je 4 von 12 Spalten, im Handoff zweimal genannt), gebaut
  Geburtsdatum → Geschlecht, dann Geburtsort → USt-IdNr. **Auf beiden Screens
  gleich falsch**, Akte wie Anlegen.
- **V** Kein eigener „Person"-Abschnitt; die Felder hängen unter „Name".
- **V** Kopf: Prototyp setzt „Nr. 1033 · 11 Jahre" **in die Namenszeile** und die
  Rollen-Badges darunter; gebaut alles in eine zweite Metazeile plus Stiftsymbol.
- **V** „Archivieren" ist im Prototyp ein **schlichter Textknopf**, gebaut ein
  Outline-Knopf mit Icon, dazu zusätzlich „Zurück".
- **V** Reiter als **Segmentpillen** statt **unterstrichener** Reiter; die
  durchgehende Trennlinie darunter fehlt.
- **V** Hinweis „Stammdaten werden erst nach ‚Bearbeiten' änderbar." fehlt;
  „Bearbeiten" Outline statt Primär.
- **V** „Land" als Textfeld „Land (ISO-Code, z. B. DE)" statt Auswahl
  „Deutschland"; „Nachname" ohne Pflichtstern.
- **A** Sechster Reiter „Termine" · Abschnitte durch Linie statt Kartenrahmen
  (beide D6) — der Prototyp hat allerdings **zusätzlich** eine Karte um das Ganze.

**Kontaktakte — Notizen**

- **V** **Die zweispaltige Lese-Ansicht ist zu einem flachen Stapel geworden.**
  Prototyp und Handoff („Liste + Lesespalte mit Inline-Editor"): links eine
  schmale Listenspalte (Datum · Art · einzeilige Vorschau · Schloss ·
  Anhangzähler), rechts die gewählte Notiz breit gesetzt mit eigener Aktionszeile.
  Gebaut: alle Notizen untereinander, jede vollständig aufgeklappt. Es gibt keine
  Listenspalte.
- **V** Kein Anhang-Indikator (Büroklammer + Zahl) in der Zeile.

**Kontaktakte — Vorgänge**

- **V** Die Zeilen tragen **nur noch das Art-Badge**. Der Prototyp zeigt daneben
  den **Terminstatus** („Termin Geplant", „Termin Angefragt", „Termin Bestätigt",
  „Termin Kurzfristig abgesagt" in Rot), den Vorgangsstatus und den
  Abrechnungsstand.

**Kontaktakte — Rechnungen**

- **V** Die Karte **„Abrechenbar, noch nicht in Rechnung"** über der Liste fehlt —
  Titel, „3 Vorgänge seit der letzten Rechnung", Betrag, „Rechnung erstellen".
- **V** Den Zeilen fehlen Leistungszeitraum („1 Vorgang · Juli") und
  Fälligkeitsangabe („fällig 14.08.2026", „bezahlt 28.07.2026", „fällig seit
  14.07.2026"). Knopf heißt „Neue Rechnung" statt „Rechnung erstellen".

**Kontakt anlegen**

- **V** Untertitel „Die Kontaktnummer wird beim Speichern vergeben." fehlt.
- **V** Rollen-Checkboxen in **zwei** Spalten; das Handoff schreibt **drei feste**
  vor (`repeat(3, minmax(150px, 220px))`, kein `auto-fit`).
- **V** Kein Kartenrahmen um das Formular, und **keine klebende Fußzeile** — im
  Prototyp sind „Abbrechen"/„Kontakt anlegen" am unteren Kartenrand angeheftet, im
  Viewport der gebauten Seite ist keine Fußzeile zu sehen.

### D7 — Zahlungen

- **V** **Die beiden Kacheln fehlen vollständig.** Im Prototyp **sind sie der
  Reiterumschalter** — große Flächen mit Betrag, zwei Infozeilen und dem roten
  „2 Rechnungen überfällig". Gebaut: ein kleines Segmentcontrol ohne jede Zahl.
  Das Handoff beschreibt sie eigens. Nirgends besprochen. Größte Einzelauslassung.
- **V** **Zwei Statusspalten statt einer** — „STATUS" *und* „ZAHLUNGSSTAND". Der
  Prototyp hat eine, die beides zusammenfasst. Widerspricht D7s eigener Begründung
  fürs eine Chipband: „ein Dokument ist in *einem* Zustand". Die Chips wurden
  zusammengeführt, die Spalten nicht.
- **V** Chips ohne Zähler, und die Liste stimmt nicht: vorgegeben sechs („Alle,
  Entwurf, Offen, Überfällig, Bezahlt, Storniert", Zahl **vor** dem Wort), gebaut
  sieben — „Teilweise bezahlt" kommt hinzu, „Entwurf" heißt „Entwürfe".
- **V** **Betrag und Offen sind vertauscht.**
- **V** Nebenangaben in der Statuszelle fehlen („45,00 € bezahlt", „bezahlt am
  03.08.2026"); die Überfälligkeit steht nicht in der Zeile („07.08.2026 **seit
  5 Tagen**" in `text-destructive`).
- **V** Tabellenkopf hier versal 12 px, im Prototyp gemischt 14 px wie in der
  Kontaktliste.
- Reiter „Offene Vorgänge": **datenbedingt** nicht vergleichbar.
- **A** Ein Chipband statt zweier · Massenauswahl nicht in der URL (beide D7).

### D8 — Vorgänge

- **V** **Kontaktnamen in Vornamensform** („Ödön Özdemir") statt „Nachname,
  Vorname" wie im Prototyp — und wie in der gebauten Kontaktliste, die
  „Musterfrau, Erika" schreibt. Die beiden Listen widersprechen sich untereinander.
- **V** Die **Trennlinie unter dem Filterblock fehlt**, die im Prototyp über die
  ganze Inhaltsbreite läuft.
- **V** Wochentag mit Punkt („Mi., 26.08.2026") statt „Mi, 12.08.2026".
- **A** Art-Filter · zwei Abschnitte „Kommend"/„Bisher" · keine Spaltenauswahl ·
  keine zweite Breadcrumb-Ebene · sechs vom Prototyp weggelassene Dinge bleiben
  (alle D8).

### D9 / D9.5 — Kalender

- **V** **Terminblöcke vollflächig gefüllt statt getönt.** Der Prototyp zeichnet
  eine sehr helle Tönung der Artfarbe mit kräftigem Farbstrich links und dunklem
  Text; gebaut volle Sättigung über die ganze Fläche. Optisch der lauteste
  Unterschied im ganzen Abgleich.
- **V** **Statusfilter-Chipzeile und Farblegende sind Zutaten**, die der Prototyp
  nicht hat — in D9 nicht erwähnt, und in der Tagesansicht ebenso vorhanden.
- **V** Die Karte **„Nächste freie Zeit" mit „Termin dort anlegen"** im
  Tagesüberblick fehlt.
- **V** **Der Tagesüberblick zeigt einen Tag außerhalb des Zeitraums.** Regel:
  gewählter Tag, sonst heute, sonst erster Tag des Zeitraums. Angezeigt ist
  10.–14.08., der Überblick steht auf So., 16.08. — heute liegt nicht im Zeitraum,
  also müsste dort der 10.08. stehen.
- **V** Kein Auswahl-Ton auf der Spalte des gewählten Tags.
- **V** Kennzahl-Labels: „belegt" → „Stunden", „Absagen" → „Abgesagt".
- **V** Tagesüberblick-Titel „So., 16.08.2026" statt „Mittwoch, 12. August".
- **V** Datumsbereich „10.08. – 14.08. 2026" (Leerzeichen vor der Jahreszahl)
  statt „10. – 14. August 2026".
- **V** Freie Dauern 15/30/**45**/60/**90** statt der vorgegebenen 15/30/60.
- **V** **„Neuer Termin" bricht in eine zweite Zeile um.** D9 sagt, der Knopf
  „gehört in den Kopf"; die Kopfzeile ist zu voll, seit „Freien Termin finden"
  danebensteht.
- **A** Zwei Spalten statt drei · drei Ansichten statt fünf · volle 24 Stunden auf
  07:00 gescrollt (alle D9) · Terminfinder als dritter Zustand der Leiste · Arten
  ohne Dauer nicht in der Liste · kein Seed für Öffnungszeiten (alle D9.5).
- Die Kalenderwoche ist gebaut **richtig** (KW 33); der Prototyp zeigt für
  denselben Zeitraum KW 32 — hier irrt der Prototyp.

---

## Was ich zuerst anfassen würde

1. **Ursachen 1–3** — drei Dateien, rein numerisch, hebt jeden Bildschirm
   gleichzeitig: Inhaltsbreite und Kopfabstand in `_app.tsx`, Grad und Zeilenhöhe
   in `page-header.tsx` samt drittem Textslot, Kopfzeilengrad in `list-card.tsx`.
2. **Ursache 5** — die Zusammenfassungszeile über Listen und der Schlusssatz unter
   den Einstellungskarten. Betrifft acht Listen, ist überall dieselbe Zeile.
3. **Chevron → Pfeil, 36 → 26 px** in `catalogue-controls.tsx` — eine Datei,
   sieben Listen.
4. **Ursache 4** — Lesemodus als Text. Größte Wirkung, braucht deine Entscheidung.
5. **Zahlungen: Kacheln und die zweite Statusspalte**, **Notizen: die
   Lesespalte** — die drei größten inhaltlichen Rückstände.
6. **Farbklotz → Farbkreis** und **Tönung statt Füllung** — zwei kleine Eingriffe
   mit großer optischer Wirkung.

Ein Muster zieht sich durch: die Abweichungen widersprechen fast nie einer
Repo-Regel, sie sind **Auslassungen**. Und sie sammeln sich dort, wo der Prototyp
**zwei Dinge nebeneinander** setzt — Reiter *und* Zahl, Wert *und* Relativzeit,
Liste *und* Lesespalte, Status *und* Nebenangabe. Gebaut steht dann nur eines da.
