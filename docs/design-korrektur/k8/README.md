# K8 — Zahlungen

Beide Reiter der Zahlungsseite. Bilder sind der gebaute Stand bei 1440 × 950, DPR 2, hell,
`de-DE`, `Europe/Berlin`.

## Gemessen, beide Seiten

| | Prototyp | Gebaut |
|---|---|---|
| Kachelraster | `551px 551px`, Abstand 14, `margin-top` 20 | identisch |
| Kachel | 551 × 104, Polster `15px 18px 14px`, Radius 12 | identisch |
| Beschriftung der Kachel | 15,5 px / 600 | identisch |
| Tabellenkopf | 14 px, keine Versalien, Höhe 40 | identisch |
| Filter-Chip | Höhe 28, Polster `0 11px`, Radius 999 | identisch, Größe von 13 auf 12,5 px |

## Die Kacheln sind der Reiterumschalter

Sie ersetzen das Segmentcontrol, das keine einzige Zahl trug. Die Frage dieser Seite ist eine
Geldfrage — was ist erbracht und noch nicht in Rechnung, und was ist in Rechnung und noch nicht
bezahlt —, und die Kacheln beantworten sie **vor** dem Klick. Der Betrag der rechten Kachel wird
rot, sobald etwas überfällig ist, und darunter steht „1 Rechnung überfällig". Gebaut auf dem
Radix-Primitiv wie `RecordTab` in K6: die Form ist die des Designs, das Tastaturverhalten das
der Bibliothek.

## Eine Statusspalte

„Status" und „Zahlungsstand" standen nebeneinander und mussten zusammen gelesen werden, um zu
sagen, woran man ist — dieselbe Doppelung, die D7 beim Chipband schon aufgelöst hatte, mit
derselben Begründung: **ein Dokument ist in einem Zustand.** Die Chips wurden damals
zusammengeführt, die Spalten nicht. Jetzt eine Spalte, deren Badge aus `invoicePaymentState()`
kommt (Regel 9: die einzige Stelle, die das entscheidet), und daneben in 12 px die Nebenangabe:
„45,00 € bezahlt", solange etwas offen ist, „bezahlt am 04.08.2026", wenn nicht.

## „Teilweise bezahlt" verschwindet nicht

Der Prototyp führt fünf Zustände und **sechs** Chips (mit „Alle"), und „Teilweise bezahlt" ist
keiner davon — weil `Offen` ihn enthält: `passt['Offen'] = r => r.stufe === 'offen'` trifft auch
die angezahlte Rechnung. Das ist inhaltlich richtig, und ein eigener Chip daneben hätte die
Summe der Chips über die Zahl der Rechnungen getrieben. `matchesInvoiceListFilter` in
`packages/shared` nimmt `partially_paid` jetzt unter `open` mit; der Zustand selbst steht als
Badge in der Zeile, deutlicher als vorher.

## Zwei Funde nebenbei

**Eine gespeicherte Spaltenauswahl überlebt eine Spaltenänderung.** Die Reihenfolge kam aus
`app_user.preferences`, und dort stand noch die alte — `Offen` vor `Betrag`, obwohl die
Definition längst umgedreht war. Eine gespeicherte Auswahl, die eine Spalte nennt, die es nicht
mehr gibt, wird jetzt ganz verworfen: den bekannten Teil zu behalten heißt, die alte
*Reihenfolge* stillschweigend weiterzuführen.

**„Offen insgesamt" unter der Tabelle zählte Entwürfe mit.** Die Zeile summierte die gefilterte
Ansicht *und* rechnete den Betrag eines Entwurfs als offen — eine Forderung, die niemand gestellt
hat. Sie war damit um 995 € von der Kachel entfernt. Die Zeile ist weg; was aussteht, sagt jetzt
die Summenzeile über den Chips, und zwar über die ganze Liste.

## Zur Methode

Der erste Durchgang zeigte nach allen Änderungen noch den alten Bildschirm: Vite hielt ein
Modul im Cache, `node_modules/.vite` löschen und neu starten half. Dieselbe Familie wie das
veraltete `packages/shared/dist` aus dem Abgleich — **ein Screenshot beweist nur, was der Server
gerade ausliefert.** Wenn eine Änderung im Bild nicht auftaucht, ist der Cache die erste
Vermutung, nicht der Code.

## Testdaten

Ergänzt: zwei abrechenbare Vorgänge bei Ödön Özdemir, damit der erste Reiter zwei Gruppen zeigt,
und Rechnung 2026-0009 (125,00 €, Rechnungsdatum 01.08.2026), die dadurch überfällig ist und die
rote Zeile samt „seit 3 Tagen" belegt. Bleibt stehen, wie die Daten aus K7.
