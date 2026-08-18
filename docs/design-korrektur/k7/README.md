# K7 — Kontakt-Reiter

Notizen, Vorgänge, Rechnungen und Übersicht der Kontaktakte. Bilder sind der gebaute Stand bei
1440 × 950, DPR 2, hell, `de-DE`, `Europe/Berlin`.

## Gemessen, beide Seiten

| | Prototyp | Gebaut |
|---|---|---|
| Notiz-Karte | 1100 × 650, Radius 10 | identisch |
| Spalten der Karte | `300px 798px` | identisch |
| Listenspalte | 300 px, 1 px Trennlinie rechts | identisch |
| Zeile in der Liste | Polster `11px 14px 12px`, 3 px linke Marke | identisch |
| Rollen der Marke | gewählt: `--primary` + Kartenfläche | identisch |
| Einzug eines Nachtrags | 26 px statt 14 | identisch |

Der Versatz von 2 px in allen x-Werten ist die Breite der Seitenleiste (234 gegen 236), ein
Rückstand aus D3.

## Die Höhe der Notiz-Karte

Der Prototyp setzt `calc(100vh − 300px)`. Die 300 sind gemessen und stehen als Tabelle im
Kommentar an `PANEL_HEIGHT` in `components/note-panel.tsx`: Kopfzeile 56, Kopfleiste der Akte
mit Reitern 137, der `gap-2` unter der Reiterzeile 8, `pt-6` des Reiterinhalts 24, Filterzeile
mit ihrem `mb-4` 52, und 23 bleiben unter der Karte. Nach dem Kalender-Fund aus K6 steht im
Kommentar auch, warum das eine Zahl ist, die man nachrechnen muss, sobald oben etwas seine Höhe
ändert — und wo man dann nachsieht.

## Die K3-Korrektur

`docs/design-korrektur/abweichungen.md` — die Chip-Zeilen über den drei Reitern **filtern** im
Prototyp, anders als K3 notiert hatte. Der Eintrag steht dort jetzt durchgestrichen mit dem
Fehler benannt: der Klick verschiebt die Auswahl *und* filtert, und ich hatte aus dem einen
geschlossen, dass es das andere nicht gibt. Gebaut sind echte Filter; die Null bleibt stehen;
`CountChip` ist gelöscht.

## Zwei abgeleitete Felder auf der Leseseite

Damit eine Rechnungszeile sagen kann, was der Prototyp sagt:

- **`invoiceLine.activityId`** — der Vorgang, aus dem die Position stammt. Ein `LEFT JOIN` auf
  `activity_item`, links und nicht innen, weil eine frei getippte Position zu keinem Vorgang
  gehört und trotzdem auf der Rechnung bleiben muss. Damit steht in der Zeile „2 Vorgänge · Juli"
  statt „3 Positionen": mehrere Zeilen kommen regelmäßig aus einer Sitzung, das Zählen von Zeilen
  beantwortet also eine andere Frage.
- **`invoice.lastPaidOn`** — der jüngste Zahlungstag, damit „bezahlt 04.08.2026" ein Datum trägt.
  `paidCentsByInvoice` heißt jetzt `paymentSummaryByInvoice` und liefert beides aus derselben
  gruppierten Abfrage.

Beide sind abgeleitet und nirgends gespeichert, wie `paidCents` und `lastSentAt` daneben. Keine
Migration. Tests: `invoice.test.ts` („names the activity a line came from, and nothing for a free
one"), `payment.test.ts` („reports the newest payment date and nothing before the first one" —
der dritte Zahlungseingang wird zuletzt erfasst und mitten hinein datiert, weil gefragt ist, wann
das Geld kam, und nicht, in welcher Reihenfolge getippt wurde).

## Der Notiz-Dialog hat keinen Lesemodus mehr

Er hatte nie einen Aufrufer, und mit der Lesespalte kann er keinen mehr bekommen: alle drei Wege
hinein — „Neue Notiz", „Bearbeiten", „Nachtrag" — heißen schreiben. Gelöscht sind `startEditing`,
die Lesezweige, `components/read-mode-footer.tsx` und der `disabled`-Zweig von `NoteEditor`, der
nur für diesen Lesemodus existierte. Der Satz in CLAUDE.md, der `ReadModeFooter` als Mechanismus
für alle Dialoge nannte, ist gestrichen und durch den Grundsatz ersetzt, dass ein Dialog, in den
jeder Weg „bearbeiten" heißt, keinen Lesemodus behalten darf.

## Testdaten

Die Entwicklungsdatenbank hatte für diese vier Reiter fast nichts. Angelegt wurden für „Erika
Musterfrau" sieben Vorgänge mit Positionen, Terminen und den drei Vorgangsstatus, daraus zwei
festgeschriebene Rechnungen (2026-0007 bezahlt, 2026-0008 offen) und eine Zahlung. **Das bleibt
stehen** — anders als bei einem Wegwerf-Durchlauf: eine festgeschriebene Rechnung lässt sich nach
Regel 9 nicht löschen, und K8 (Zahlungen) braucht genau solche Zeilen. Die drei leeren
Rechnungsentwürfe aus früheren Paketen sind dabei gelöscht worden.

## Was nicht in K7 war

Der Prototyp lässt in der Lesespalte auch schreiben (siehe Register) und zeigt im Vorgangs- und
Rechnungsreiter die aufklappenden Detailbereiche in einer eigenen Fassung; die gebauten
Inline-Details aus D8 bleiben, wie sie sind.
