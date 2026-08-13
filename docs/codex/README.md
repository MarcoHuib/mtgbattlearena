# Codex implementation guides

Deze map bevat kleine, opeenvolgende implementatieopdrachten. De bedoeling is dat
de chatprompt kort blijft en Codex de uitgebreide requirements uit versiebeheer
leest.

Voer de bestanden in volgorde uit:

1. `01-deck-library.md`
2. `02-moxfield-queue.md`
3. `03-moxfield-provider.md`
4. `04-manabox-private-provider.md`

Gebruik per feature een aparte branch en pull request. Start niet aan de volgende
feature totdat de huidige Definition of Done en relevante checks slagen.

## Minimale startprompt

Voor Feature 1 is voldoende:

```text
Lees AGENTS.md, ROADMAP.md en docs/codex/01-deck-library.md volledig.
Inspecteer daarna de bestaande repository en implementeer uitsluitend Feature 1
volgens die documenten. Voer alle genoemde checks uit en werk relevante docs bij.
De uitgebreide Firestore-, CRUD- en `sourceHash`-migratieregels staan bewust in
`docs/codex/01-deck-library.md`, niet in deze chatprompt.
```

De featurebestanden mogen nooit vertrouwelijke providercredentials,
niet-openbare ManaBox-upstreamdetails, private raw responses of andere informatie
bevatten die volgens ADR 012/015 buiten de publieke repository hoort.
