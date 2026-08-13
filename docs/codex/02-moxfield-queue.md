# Codex Feature 2 — Moxfield FIFO/rate-limit infrastructuur

## Lees eerst

Lees volledig:

- `AGENTS.md`
- `ROADMAP.md`
- `docs/architecture/010-provider-agnostic-deck-import.md`
- `docs/architecture/012-confidential-provider-adapters.md`
- `docs/architecture/014-moxfield-queued-imports.md`
- `docs/legal/PROVIDER_INTEGRATIONS.md`

Feature 1 moet al zijn gemerged. Inspecteer de actuele Firestore Deck Library,
application-API, Import Worker en Durable Object-conventies voordat je code
schrijft. De queue levert jobstatus aan dezelfde Deck Library; introduceer geen
parallelle persistencebron voor decks.

## Scope

Bouw uitsluitend de globale Moxfield jobqueue en provider-neutrale jobstatusflow.
Gebruik een mock upstream; sluit de echte Moxfield API/credential nog niet aan.

## Bindende invarianten

- alle toekomstige Moxfield Import én Update requests moeten via dezelfde
  singleton queue per environment lopen;
- FIFO voor geaccepteerde jobs;
- maximaal één upstreamrequest tegelijk;
- minimaal 1,1 seconde tussen starts van upstreamrequests;
- maximaal één queued/processing job per geverifieerde UID;
- 10 seconden cooldown per UID op nieuwe Moxfield Import/Update-acties;
- upstreamtimeout van maximaal 10 seconden;
- queue kan na objectre-instantiatie doorgaan met geaccepteerde duurzame state;
- providerfouten veroorzaken geen agressieve automatische retries;
- geen alternatief endpoint/codepad kan de queue omzeilen.

Gebruik bij voorkeur één Durable Object als centrale scheduler. Gebruik de
bestaande Firebase/App Check/auth-grenzen wanneer de job-API via de Game Worker
wordt aangeboden; vertrouw nooit een client-meegegeven UID.

## Clientstatus

Ontwerp een provider-neutraal jobcontract met minimaal:

- jobId;
- status: queued / processing / completed / failed;
- optionele positie/wachttijdindicatie;
- stabiele foutcode.

De Firestore-backed Deck Library moet bij een openstaande job verdere Moxfield
Import/Update-acties voor die gebruiker blokkeren. Server-side blijft de
invariant leidend. Een completed job mag pas als succesvol worden gemarkeerd
nadat de providerresponse gevalideerd is en de Feature-1 authoritative
Create/Update-mutation veilig is afgerond; queue-state wordt geen tweede deck
source of truth.

## Security

Voeg geen echte credential toe. Voeg geen niet-openbare raw providerfixture toe.
Logs bevatten geen requestheaders of responsebody die later gevoelig kunnen
worden. Houd foutpayloads provider-neutraal.

## Verplichte tests

Gebruik fake timers/controleerbare klok en mock fetch. Test minimaal:

- 20 gelijktijdige jobs van verschillende users;
- exact één request tegelijk;
- minimale 1,1s startafstand;
- FIFO;
- tweede pending job van dezelfde UID geweigerd;
- 10s cooldown;
- timeout waarna volgende job verwerkt kan worden;
- 4xx/5xx/throttlefout zonder retry-storm;
- re-instantiatie/herstel;
- ontbrekende configuratie fail-closed;
- expliciete test dat geen publieke importcode direct een Moxfield-upstream kan
  aanroepen.

CI mag nooit de echte provider benaderen.

## Buiten scope

- echte Moxfield URL/parser/API mapping;
- echte credential;
- ManaBox;
- veranderingen aan Archidekt tenzij nodig voor provider-neutrale queuecontracten;
- ongerelateerde lobby/gameplayrefactors.

## Verificatie

Voer relevante lint/typecheck/unit/integratietests en Worker dry-runs uit plus de
algemene repositorychecks uit `AGENTS.md`.

Werk docs pas naar “gerealiseerd” bij nadat de queue-invarianten door tests zijn
bewezen.
