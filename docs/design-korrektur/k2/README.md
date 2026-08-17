# K2 — Nachweis

Drei Bildschirme, aufgenommen wie beim Abgleich: 1440 × 950, DPR 2, helles Standardschema.
Jedes Bild geöffnet und gelesen.

- `*.png` — Lesemodus, links Prototyp, rechts gebaut
- `*-bearbeiten.png` — derselbe Bildschirm nach „Bearbeiten"

## Was die Bilder zeigen

**Im Lesemodus steht kein Feld mehr.** Label, darunter der Wert als Text, fehlende Werte als
`—`. Kein Rahmen, kein grauer Kasten. Vorher war eine wenig gefüllte Akte eine Wand aus leeren
Rahmen; jetzt sagt sie in einer Spalte `—`, was sie zu sagen hat.

**Die lesbare Form stimmt, nicht die gespeicherte.** Auf `D4-einst-mailversand.png` steht
`STARTTLS (üblich, Port 587)` und nicht `starttls`; auf der Kontaktakte `Person` und nicht
`person`, `14.08.1926` und nicht `1926-08-14`. Diese Bezeichnungen leben ausschließlich in der
Optionsliste des jeweiligen Auswahlfelds — ohne Zuordnung hätte der Lesemodus den Code gezeigt.

**Das Passwort zeigt Punkte, nicht `—`.** „Gespeichert, aber nicht anzeigbar" ist etwas anderes
als „nicht hinterlegt", und diese Zeile ist die einzige Stelle, an der der Unterschied sichtbar
werden kann.

**Der Wechsel verschiebt keine Zeile.** Das `<Label>` ist in beiden Modi dasselbe Element;
zwischen Lese- und Bearbeitungsbild wandert nur der Kasten hinein. `min-h-9` an `ReadValue`
entspricht der Höhe des `Input`, den es ersetzt, damit ein zweispaltiges Raster nicht umbricht,
wenn eine Seite einen Wert hat und die andere nicht.

## Zwei Nebenwirkungen, beide beabsichtigt

- **Ein latenter Fehler ist mitverschwunden.** `onCancel` der Kontaktakte setzt das Formular
  nicht zurück. Der alte Lesemodus zeigte deshalb nach „Abbrechen" die **verworfenen**
  Änderungen weiter an — er las aus dem Formular. `ReadValue` wird aus dem geladenen Datensatz
  gespeist, also steht dort jetzt, was gespeichert ist.
- **`ReadModeFieldset` ist gelöscht**, samt `useReadOnly`; `components/ui/select.tsx` ist wieder
  die unveränderte shadcn-Fassung. Nach der Umstellung hätte die Komponente nie mehr
  `disabled={true}` bekommen. Die Radix-Erkenntnis dahinter — `pointerdown` wird auch an
  deaktivierte Controls geliefert, ein `<fieldset disabled>` fängt nur den Klick — steht jetzt
  in CLAUDE.md, damit sie nicht mit dem Code verschwindet.

## Was auf den Bildern noch abweicht, und wohin es gehört

Alles davon ist K4 oder K6, nichts davon ist K2:

- Kontaktakte: kein Kartenrahmen außen, kein „Rollen"-Abschnitt, kein eigener
  „Person"-Abschnitt, Feldreihenfolge Geburtsdatum → Geschlecht statt → Geburtsort, der Hinweis
  „Stammdaten werden erst nach ‚Bearbeiten' änderbar." fehlt, „Bearbeiten" ist Outline statt
  Primär. **(K6)**
- `Land` liest `DE`, nicht `Deutschland` — das Feld ist ein Text-Input mit ISO-Code, der
  Prototyp zeigt ein Auswahlfeld mit dem Ländernamen. Der Feldtyp ist **K4** (Praxis) bzw.
  **K6** (Kontakt); im Lesemodus steht deshalb so lange der Code.
- Einstellungen/Praxis: fünf Karten statt einer, keine Abschnittserläuterungen. **(K4)**
- Mailkonto: „Bearbeiten" am Kartenfuß statt im Kartenkopf. **(K4)**
