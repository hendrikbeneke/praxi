# K1 — Nachweis

Fünf Paare, links Prototyp, rechts gebaut, nach K1. Aufgenommen wie beim Abgleich:
Viewport 1440 × 950, DPR 2, helles Standardschema, `de-DE`, `Europe/Berlin`. Jedes Bild wurde
geöffnet und gelesen, nicht nur erzeugt.

## Gemessen, beide Seiten

| | Prototyp | Gebaut |
|---|---|---|
| H1 | 26 px / 28,6 px / −0,572 px | **26 px / 28,6 px / −0,572 px** |
| Listenkopf, Schrift | 11 px / 0,22 px | **11 px / 0,22 px** |
| Listenkopf, Polster | 9px 16px | **9px 16px** |
| Pfeilknopf | 26 × 26 px | **26 × 26 px** |
| Pfeilform | `arrow-up` / `arrow-down` | **`arrow-up` / `arrow-down`** |
| Kopfabstand Leistungen | 22 / 32 / 40 | **22 / 32 / 40** |
| Kopfabstand Einstellungen | 22 / 32 / 48 | **22 / 32 / 48** |
| Kopfabstand Kontaktliste | 26 / 32 / 24 | **26 / 32 / 24** |
| Kopfabstand Vorgänge | 22 / 32 / 14 | **22 / 32 / 14** |

**Die Kappung wurde bei 1800 px geprüft, nicht bei 1440** — bei 1440 greift sie auf keiner der
beiden Seiten, ein Vergleich dort hätte nichts bewiesen. Bei 1800 px läuft der Inhalt im
Prototyp von 268 bis 1384, gebaut von 266 bis 1382; die zwei Pixel sind die Seitenleiste
(235 gegen 233). Erster Versuch war um 64 px zu breit, weil `ContentWidth` innerhalb von
`main`s `px-8` sitzt, der Prototyp die 1180 aber auf dasselbe Element wie das Polster legt —
deshalb rechnet die Komponente die Einrückung jetzt selbst ab.

## Was noch abweicht, und wohin es gehört

- **Leistungen, Kopfzeilenhöhe 52 gegen 35,5 px.** Nicht behoben, und mit K1 auch nicht
  behebbar: die Höhe kommt vom Umbruch von „ZIFFER (GEBÜH)" auf zwei Zeilen. Mit 11 px statt
  12 wurde die Zeile dadurch sogar 3 px höher als vorher. Das Label kürzt K5 auf „ZIFFER",
  dann fällt sie von selbst.
- **Kontaktliste, H1.** Der Prototyp setzt hier **24 px / 36 px**, auf allen anderen
  Bildschirmen 26 px / 1.1 — das Design ist an dieser Stelle uneinheitlich. Gebaut sind jetzt
  überall 26 px, wie beauftragt. Auf dem Bild ist „Kontakte" rechts einen Hauch größer.
- Alles Übrige auf den Bildern gehört zu K3–K9: fehlende Zähler an den Reitern, der
  Erläuterungssatz samt Knopf in der Karte statt im Seitenkopf, der fehlende Spaltenkopf
  „STATUS", der Farbklotz bei den Vorgangsarten, der fehlende Schlusssatz unter den
  Einstellungskarten.
