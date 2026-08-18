# K5 — Nachweis

Drei Paare, links Prototyp, rechts gebaut. 1440 × 950, DPR 2, helles Standardschema.

## Gemessen, beide Seiten

| | Prototyp | Gebaut |
|---|---|---|
| Kopfzeilenhöhe | **35,5 px** | **35,5 px** |
| Kopfzeile, Schrift | 11 px / 0,22 px / `9px 16px` | 11 px / 0,22 px / `9px 16px` |
| Kopfzeile, Text | `KÜRZEL BEZEICHNUNG ZIFFER PREIS DAUER STATUS` | dito |
| Zeilentext | 14 px | 14 px |
| Bezeichnung, Gewicht | 600 | 600 |
| Reiter | 32 px, `rounded-full`, 13,5 px | dito |

**Die Kopfzeilenhöhe war der offene Punkt aus K1** und ist damit geschlossen. Sie kam nicht vom
Polster — das stimmte schon —, sondern vom Umbruch von „ZIFFER (GEBÜH)" auf zwei Zeilen. Mit
der kurzen Spaltenüberschrift fällt sie von 52 auf 35,5 px.

## Eine Korrektur an der Vorgabe

Die Sieben-Spalten-Angabe (58 / 1fr / 48 / 76 / 80 / 66 / 26 / 26) steht in der **Prosa des
Handoff-READMEs**, nicht im Markup. Der Prototyp benutzt selbst ein **fünfspaltiges** Grid und
hängt Status und Pfeile daneben in dieselbe Flex-Zeile:

```
<div flex gap:12px …>
  <span grid [58px 1fr 48px 76px 80px] gap:10px flex:1> … </span>
  <span width:66px>Status</span>
  <span width:26px></span>
  <span width:26px></span>
</div>
```

Die gebauten **Zeilen** entsprachen dem schon exakt. Gefehlt haben nur die drei Zellen in der
**Kopfzeile** — deshalb war „Status" ohne Überschrift. Der Eingriff ist damit drei Spans statt
eines Rasterumbaus.

Das ist die dritte Stelle, an der README-Prosa und Prototyp-Markup auseinandergehen (nach den
Inhaltsbreiten in K1 und der Titelspalte in K4). Ab hier gilt das Markup als Quelle.

## Zwei Fallen derselben Art wie in K4

- **`Aktiv` ist kein Spaltenkopf.** Erster Versuch setzte `strings.catalogue.active` in die
  Kopfzeile — der Prototyp schreibt dort „Status". „Aktiv" ist, was eine *Zeile* sagt.
- **`tabRelations` trug Navigationslabel und Kartentitel zugleich.** Der Prototyp benutzt zwei
  Wörter: die Bereichsspalte sagt „Beziehungen", die Karte „Beziehungsarten" — dort werden
  Typen gepflegt. Derselbe Ein-String-für-zwei-Zwecke-Fehler wie bei den Bereichshinweisen in
  K4, deshalb jetzt `relationCardTitle` daneben.

## Nachgetragen: ein Typfehler aus K4

`pnpm typecheck` fand einen Fehler im PDF-Test, den K4 mitcommittet hatte: `recipientSnapshot`
ist auf der Rechnung nullable, und das Spreaden eines nullable macht in TypeScript jeden
Schlüssel optional. In K4 war die Typprüfung vor dem Hinzufügen des Tests gelaufen, und
`vitest` prüft Typen nicht. Der Fixture-Empfänger ist jetzt eine eigene typisierte Konstante.
