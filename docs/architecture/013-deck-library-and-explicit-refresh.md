# ADR 013 — Deck Library, expliciete CRUD en provider-refresh

## Status

Proposed — bijgewerkt 13 augustus 2026.

## Context

De huidige implementatie gebruikt provider-neutrale sources/revisions en een
`sourceHash`/fingerprint om freshness/cachegedrag te ondersteunen. Deckimports
kunnen daarnaast nog dicht tegen game-setup aan liggen.

De nieuwe productrichting maakt het veel eenvoudiger: een deck wordt bewust aan
de persoonlijke Deck Library toegevoegd en blijft daar staan totdat de gebruiker
het bijwerkt of verwijdert. Een online game kiest daarna alleen uit opgeslagen
decks. Daarmee is geen contentfingerprint meer nodig om te bepalen of een
provider opnieuw moet worden geraadpleegd.

ADR 016 legt vast dat Cloud Firestore de duurzame cloud Deck Library wordt en dat
Cloudflare provider/security/realtime verantwoordelijkheden behoudt.

## Besluit

### Deck Library als beheerpunt

`/decks` wordt de centrale gebruikersflow voor:

- deck toevoegen via een providerwizard;
- huidige opgeslagen decks bekijken;
- deck handmatig bijwerken;
- deck verwijderen uit de eigen collectie.

Gameplay gebruikt opgeslagen provider-neutrale content en benadert de provider
niet automatisch.

### CRUD in plaats van hashgestuurde upsert

De lifecycle is expliciet:

```text
Create/Import -> provider ophalen -> valideren/normaliseren -> opslaan
Read          -> opgeslagen library/content lezen
Update        -> bewuste knopdruk -> provider opnieuw ophalen -> vervangen
Delete        -> library-entry en huidige content verwijderen
```

`sourceHash` hoort niet bij dit doelmodel. Feature 1 verwijdert de hash uit de
actieve frontend-, application-API-, persistence-, import- en domeincontracten.
De bestaande code bevat nog migraties, tests en velden die ervan afhangen; die
worden gecontroleerd gemigreerd, maar de hash wordt niet als compatibiliteits-
productmechanisme behouden.

Er komt geen nieuwe client-side fingerprintcall ter vervanging. Technische cache
mag eventueel later bestaan als implementation detail, maar bepaalt nooit
identiteit, duplicate-regels of of een Update plaatsvindt.

### Stabiele bronidentiteit

De duplicate-identiteit is:

```text
uid + provider + externalDeckKey
```

Binnen de owner-scoped Firestorecollection wordt bij voorkeur een deterministische
Firestore-veilige `deckKey` uit `provider + externalDeckKey` gebruikt. Dit is geen
contenthash; dezelfde externe deckidentiteit blijft gelijk wanneer de kaarten in
het deck veranderen.

Een normale tweede Create van dezelfde bron maakt geen tweede deck aan. De
applicatie retourneert `DECK_ALREADY_IMPORTED` en verwijst naar **Update**. De
persistencegrens moet concurrente dubbele Creates ook voorkomen.

### Expliciete Update

Alleen een bewuste **Update**-actie haalt opnieuw gegevens bij de provider op.
Bij succes worden de actuele provider-neutrale content en afgeleide metadata
vervangen. Bij providerfout, timeout of ongeldige data blijft de vorige versie
volledig bruikbaar; er wordt geen half geüpdatete library-entry zichtbaar.

Bestaande games en expliciete offlinepakketten blijven verwijzen naar de inhoud
waarmee ze al zijn gestart. Een libraryupdate muteert nooit stilzwijgend een
lopende of historische battle.

### Firestore en loadverdeling

Cloud Firestore wordt de duurzame source of truth voor clouddecks. Kleine
librarymetadata staat los van de volledige huidige deckcontent zodat `/decks`
niet voor elke cardtile alle kaartdata hoeft te lezen.

Owner-scoped reads mogen rechtstreeks uit Firestore lopen onder Firebase Auth,
Security Rules en App Check. Authoritative Create, Update en Delete lopen via de
beschermde application-API. Cloudflare houdt geen tweede volledige permanente
Deck Library bij.

Zie [ADR 016](./016-firestore-deck-library.md).

### Online lobby

Een online lobby biedt uitsluitend selectie van reeds opgeslagen decks. Import,
Update en verwijderen horen in de Deck Library en niet in de lobby.

Wanneer geen deck beschikbaar is, toont de lobby een empty state met een link
naar `/decks`. De client stuurt bij game-start alleen een library `deckKey`; de
server valideert ownership en haalt de authoritative content op voordat de game
wordt geïnitialiseerd. Game-start doet geen providerrequest.

### Foutsemantiek

Providerupdates zijn transactioneel vanuit gebruikersperspectief: bij timeout,
ongeldige providerdata of andere fout blijven metadata en huidige content van de
laatste succesvolle versie intact.

## Gevolgen

Voordelen:

- veel eenvoudiger CRUD-model;
- geen frontendhash/fingerprintcall meer;
- game-start is sneller en provider-onafhankelijk;
- providerbeschikbaarheid heeft minder invloed op gameplay;
- expliciete updates passen goed bij beperkte providerquota;
- duplicate-imports krijgen een stabiele identiteit zonder kaartinhoud te hashen;
- Firestore en Cloudflare krijgen duidelijke, verschillende verantwoordelijkheden.

Nadelen:

- bestaande `sourceHash`-velden en migraties moeten in één beheerste feature
  worden verwijderd;
- gebruikers moeten zelf op **Update** drukken om providerwijzigingen op te halen;
- de Deck Library krijgt meer verantwoordelijkheid en moet goede empty/loading/
  error states hebben;
- Firestore introduceert een extra persistence/securitygrens die expliciet moet
  worden getest.

## Implementatievolgorde

Zie [`../../ROADMAP.md`](../../ROADMAP.md),
[`../codex/01-deck-library.md`](../codex/01-deck-library.md) en
[ADR 016](./016-firestore-deck-library.md).
