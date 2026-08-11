# Kontaktdetails — Feldinventar

Screen: `/contacts/$contactId` (`apps/web/src/routes/_app/contacts.$contactId.tsx`,
zusammengesetzt aus `ContactHeader`, `ContactForm`, `ContactOverview`,
`ContactRelations`). Öffnet immer im **Lesemodus** — Bearbeiten ist ein
bewusster Schritt über einen „Bearbeiten"-Button, niemals der Startzustand
außer beim Neuanlegen.

Ein neuer Layoutvorschlag darf Anordnung und Optik ändern, muss aber **jedes
Feld unten** weiterhin zeigen — kein stillschweigendes Weglassen. Wo eine
Regel genannt ist (Pflichtfeld, nur bei Anlage sichtbar, abgeleiteter Wert),
gilt sie unverändert.

## Kopfbereich (immer sichtbar, über allen Tabs)

- Name (formatiert: Vorname Nachname bzw. Firmenname)
- Kontaktnummer (fortlaufend, „Kontaktnummer 123")
- Alter in Jahren — nur bei Personen mit Geburtsdatum, abgeleitet
- Badge „Archiviert", wenn zutreffend
- Rollen als Badges, mit Stift-Icon, das ein Popover öffnet: Checkbox-Liste
  aller aktiven Rollen zum sofortigen Ticken/Entfernen (kein Speichern-Button —
  jede Änderung speichert direkt)
- Aktionsleiste rechts: „Bearbeiten" (Stammdaten-Tab) sowie „Archivieren" /
  „Wiederherstellen" mit Bestätigungsdialog

## Tabs

Reihenfolge fix, liegt in der URL: **Übersicht · Stammdaten · Notizen ·
Vorgänge · Termine · Rechnungen**.

### Tab „Übersicht"

Ein Raster aus Karten, jede lädt unabhängig und zeigt bis dahin einen
Platzhalter:

1. **Warnbanner** (nur wenn zutreffend): minderjähriger Kontakt ohne
   hinterlegten Sorgeberechtigten — Text plus Verweis auf „Verknüpfte
   Kontakte".
2. **Kontakt** — Mobil, Festnetz (beide als `tel:`-Links, beschriftet, damit
   klar ist, welche Nummer man wählt), E-Mail (`mailto:`-Link), Anschrift
   (Straße + Hausnummer, PLZ + Ort, Land wenn ≠ DE). Wenn nichts vorhanden:
   „Keine Kontaktdaten hinterlegt."
3. **Termine und Vorgänge** — „Nächster Termin" (Datum/Uhrzeit + relative
   Angabe + Vorgangsbezeichnung, oder „Kein Termin geplant."); „Letzter
   Vorgang" (Datum/Uhrzeit + Bezeichnung, plus Button „Dokumentieren").
4. **Letzte Vorgänge** — Liste der letzten 5, je Zeile Datum, Bezeichnung,
   Badge „Dokumentiert" oder „Nicht dokumentiert".
5. **Abrechenbar** — Anzahl offener Positionen + Summe in Euro; Link „Zum
   Rechnungsentwurf", wenn bereits ein Entwurf existiert.
6. **Rechnungen** — Anzahl festgeschriebener Rechnungen; Badge „N überfällig",
   wenn vorhanden; Summe offener Beträge oder „Nichts offen."
7. **Verknüpfte Kontakte** (volle Breite) — Liste der Beziehungen, je Zeile:
   Art der Beziehung (aus der Sicht dieses Kontakts), Gegenkontakt (Link),
   Aktionen „Ersetzen"/„Entfernen". Button „Beziehung hinzufügen" öffnet einen
   Dialog mit Kontakt-Auswahl (Suche) und Beziehungsart.

### Tab „Stammdaten" — vollständiges Formular

Vier Abschnitte, jeder eine eigene Karte. **Lesemodus first**: Felder sind nur
nach Klick auf „Bearbeiten" editierbar.

**Name**
- Art: Person / Organisation (Dropdown) — **strukturell, nach dem Anlegen
  nicht mehr änderbar**, Hinweistext dazu
- Bei Person: Anrede (mit Vorschlagsliste „Herr"/„Frau", frei eingebbar),
  Titel, Vorname, **Nachname** (Pflichtfeld bei Person), Geburtsdatum
  (deutsches Datumsfeld, zweistelliges Jahr wird als Vergangenheit gelesen),
  Geschlecht (Dropdown: „Keine Angabe" / weiblich / männlich / divers),
  Geburtsort
- Bei Organisation: **Firmenname** (Pflichtfeld), Ansprechpartner
- Bei beiden: USt-IdNr. (auch eine Einzelperson kann eine haben)

**Rollen** — **nur beim Neuanlegen sichtbar**, danach ausschließlich über den
Kopfbereich editierbar. Checkbox-Liste aller Rollentypen.

**Anschrift**
- Straße, Hausnummer (eigenes Feld, wird für Anzeige/Rechnung wieder
  zusammengesetzt), PLZ, Ort, Land (ISO-Code, z. B. „DE")

**Kontakt**
- E-Mail-Adresse, Mobil, Festnetz — zwei getrennte Telefonfelder, weil die Art
  entscheidet, ob man anruft oder schreibt

**Intern**
- Interne Notiz (Mehrzeilig), mit Hinweis „Nur intern sichtbar, erscheint auf
  keinem Dokument."

Speichern/Abbrechen erscheinen nur im Bearbeitungsmodus, unten rechts.

### Tabs „Notizen" · „Vorgänge" · „Termine" · „Rechnungen"

Nicht Teil dieses Sync-Umfangs (datengebundene Listen/Dialoge außerhalb der
importierten Bausteine) — nur als vorhandene Tabs zu berücksichtigen, falls
das Layout der Tab-Leiste selbst verändert wird.
