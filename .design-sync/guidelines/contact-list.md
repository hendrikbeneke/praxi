# Kontaktliste — Feldinventar

Screen: `/contacts` (`apps/web/src/routes/_app/contacts.index.tsx`). Personen und
Organisationen der Praxis in einer Tabelle. Diese Liste ist absichtlich flach —
kein Kartenraster, keine Gruppierung außer den Rollen-Tabs — weil sie den
Arbeitstag eröffnet und schnell durchsucht werden muss.

Ein neuer Vorschlag für dieses Layout darf das Aussehen ändern, muss aber
**jedes im Folgenden aufgeführte Element** enthalten — nichts weglassen, nichts
stillschweigend zusammenfassen.

## Kopfbereich (PageHeader)

- Titel: „Kontakte"
- Beschreibung: „Personen und Organisationen der Praxis."
- Aktion: Button „Neuer Kontakt" (Plus-Icon), führt zu `/contacts/new`

## Filterzeile

- **Suchfeld** „Suchen", Platzhalter „Name, Firma oder Kontaktnummer". Solange
  etwas eingegeben ist, sticht die Suche jeden anderen Filter — Rolle und
  Zeitfenster werden dann ignoriert, und ein Hinweistext sagt das
  („Die Suche geht über alle Kontakte — unabhängig von Rolle und Zeitfenster.").
- **Rollen-Dropdown** „Weitere Rollen" — nur sichtbar, wenn es Rollen gibt, die
  nicht als Tab angezeigt werden. Enthält „Alle" plus die übrigen Rollen.
- **Checkbox** „Archivierte anzeigen"

## Rollen-Tabs und Sortierung

- Eine Tabreihe: je ein Button pro Rolle, die als Tab markiert ist (aus den
  Praxis-Einstellungen, variable Anzahl), plus ein abschließender Button
  „Alle". Der aktive Tab ist hervorgehoben.
- Rechts daneben zwei weitere Buttons für die Reihenfolge: „Aktuell" und „A–Z".
  „Aktuell" ist die Startansicht — wer in den letzten/nächsten zwei Wochen
  einen Termin hat.

## Tabelle

Spalten, in dieser Reihenfolge, jede Kopfzelle klickbar zum Sortieren
(Pfeil-Icon zeigt die aktive Sortierung und Richtung):

| Spalte | Inhalt |
|---|---|
| Nr. | `contactNumber`, rechtsbündige Ziffern |
| Name | Nachname-zuerst-Sortierform, plus Badge „Archiviert" wenn zutreffend |
| Rollen | ein Badge pro Rolle des Kontakts, „—" wenn keine |
| Ort | `city`, „—" wenn leer |
| Geburtsdatum | deutsches Datumsformat, „—" wenn leer |
| Termin | **nur in der Reihenfolge „Aktuell"**: Datum/Uhrzeit plus relative Angabe („in 2 Tagen" o. ä.) |

Eine Zeile ist klickbar und öffnet den Kontakt. Leerzustand: unterschiedliche
Meldungen für „lädt", „nichts gefunden bei Suche", „niemand hat in den
nächsten/letzten zwei Wochen einen Termin" (mit Aktion „Alle Kontakte
anzeigen") und „wirklich keine Kontakte in diesem Filter".

Fußzeile: „X von Y angezeigt", wenn mehr Treffer existieren als geladen wurden
(Seitengröße 50).
