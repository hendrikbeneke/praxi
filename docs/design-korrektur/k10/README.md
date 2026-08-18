# K10 — Kalender

Der letzte Korrekturdurchgang. Bilder bei 1440 × 950, DPR 2, `de-DE`, `Europe/Berlin`.

## Der Terminblock, und warum `readableTextOn` hier falsch liegen muss

Der Prototyp malt einen Eintrag als **Tönung der Artfarbe über der Karte, mit der Farbe selbst
als Strich am linken Rand**:

```
abgesagt:  var(--muted),                              Rahmen gestrichelt, durchgestrichen
angefragt: color-mix(in oklab, <Art> 9%,  var(--card)), Rahmen gestrichelt in der Artfarbe
sonst:     color-mix(in oklab, <Art> 20%, var(--card)), links 3px solid <Art>
```

Text immer `--foreground`, Zeit und Zusatzzeile `--muted-foreground`. Gebaut war die **volle**
Artfarbe über die ganze Fläche, mit `readableTextOn` für Schwarz oder Weiß darauf.

**Damit fällt `readableTextOn` auf dem Block weg — und zwar nicht als Vereinfachung, sondern
weil sie dort systematisch falsch antwortet.** Sie misst die *Artfarbe*; die Fläche ist aber zu
vier Fünfteln die Karte. Für das violette `#7c3aed` (Luminanz ≈ 0,11) sagt sie „Weiß" — auf
einer in vier von fünf Schemata fast weißen Fläche. Gemessen, alle fünf Schemata, derselbe
Block:

| Schema | Blockfläche | Textfarbe |
|---|---|---|
| schiefer | `oklab(0.905 …)` | `oklch(0.25 …)` |
| blau | `oklab(0.905 …)` | `oklch(0.25 …)` |
| salbei | `oklab(0.905 …)` | `oklch(0.25 …)` |
| rose | `oklab(0.903 …)` | `oklch(0.26 …)` |
| **nacht** | `oklab(0.312 …)` | `oklch(0.95 …)` |

Die Fläche folgt `--card`, der Text ist `--foreground` — in jedem Schema richtig, ohne dass
etwas rechnet. Die Begründung steht jetzt als Kommentar an der Funktion, damit sie beim nächsten
Kalenderdurchgang nicht wieder eingeführt wird. Wo eine Fläche **wirklich** die Artfarbe ist —
die Art-Chips in Vorgangsliste, Zahlungen und Vorgangsart-Einstellungen — bleibt sie richtig.

## Kopfzeile und Leiste

„Neuer Termin" und „Freien Termin finden" sind in die rechte Leiste gewandert, oben der Knopf,
darunter Minimonat und Finder — die Zusammensetzung des Prototyps, nur spiegelverkehrt, weil er
dafür eine linke Leiste hat und wir bei zwei Spalten bleiben (D9). Die Kopfzeile ist damit die
des Designs: Heute · ‹ › · Titel · Untertitel · Ansichten, und sie bricht nicht mehr um.

Statusfilter-Chipzeile und Farblegende sind weg; der `status`-Parameter der Route ist damit
ohne Bedienelement und ebenfalls gelöscht.

## Formate und Beschriftungen

| | vorher | jetzt |
|---|---|---|
| Wochentitel | `10.08. – 14.08. 2026` | `17. – 21. August 2026`, daneben `KW 34` |
| Tagestitel | `Mi, 12.08.2026` | `Mittwoch, 12. August`, daneben `2026` |
| Tagesüberblick | `So., 16.08.2026` | `Mittwoch, 19. August` |
| Kennzahlen | Termine · Stunden · Abgesagt | Termine · **belegt** · **Absagen** |

Zwei neue Formatierer in `packages/shared`: `formatBerlinDayMonth` („14. August") und
`formatBerlinWeekdayLong` („Mittwoch, 12. August"), mit Tests. Die Zweibuchstabenliste
`strings.date.weekdays` bleibt, wofür sie da ist — Spaltenköpfe und Datumsauswahl.

## Der Überblickstag

Regel wie im Prototyp: gewählter Tag, sonst heute, sonst erster Tag des Zeitraums. Vorher stand
dort immer der Anker, der nach einem Wochenwechsel gar nicht mehr auf dem Bildschirm war.

## „Nächste freie Zeit"

Die Karte fragt den Server — `findFreeSlots` kennt Öffnungszeiten und private Belegung, und eine
zweite Antwort aus dem Browser hätte irgendwann anderes gesagt als die Vorschläge im Raster. Der
Knopf „Termin dort anlegen" erscheint nur mit einer Lücke; ohne steht „Keine freie Zeit ab 60
Min" und kein Knopf. Freie Dauern jetzt 15/30/60.

## Ein Fehlbefund

„Kein Auswahl-Ton auf der Spalte des gewählten Tags" — der Prototyp tönt allein **heute**
(`primary 3 %` in der Spalte, `8 %` in der Kopfzelle), und gebaut steht genau das. Nichts zu
tun.

## Testdaten

Öffnungszeiten Mo–Fr 08:00–12:00 und 13:00–17:00 angelegt — ohne sie antwortet der Slot-Finder
bewusst mit gar nichts (`openingHoursSet: false`), und die Karte hätte nur ihren leeren Zustand
zeigen können.
