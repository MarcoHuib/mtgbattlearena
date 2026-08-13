# Firestore Deck Library security boundary

## Status

Implemented for Roadmap Feature 1. De repository bevat de browser-readadapter,
servermutatieadapter en deploybare `firestore.rules`. Een omgeving is pas
operationeel nadat Rules, App Check-enforcement en het Worker Secret zijn
geprovisioned.

## Doel

Cloud Firestore bewaart uitsluitend duurzame, owner-scoped clouddeckdata. Het is
geen lobbydatabase, geen actieve gamestore, geen providercache en geen opslag voor
providercredentials.

```text
Browser
  ├── Firebase Auth + App Check
  └── owner-scoped Firestore reads

Protected application API / Game Worker
  ├── verified Firebase uid
  ├── Create / Update / Delete orchestration
  └── server-side Firestore adapter

Import Worker
  └── provider fetch + normalize
```

## Client policy

De browser mag alleen de eigen Deck Library lezen. Authoritative Create, Update
en Delete lopen via MTG Battle Arena en niet via vrije clientwrites.

De deploybare regels in `firestore.rules` implementeren:

```text
/users/{uid}/decks/**
  read  -> authenticated && request.auth.uid == uid
  write -> denied to normal web clients
```

App Check moet voor de Firestore Web App worden ingeregeld voordat directe
productionreads worden afgedwongen. App Check vervangt Firebase Authentication of
Security Rules niet.

## Server policy

De server vertrouwt nooit `uid`, owner path of Firestore documentpath uit de
requestbody. De geverifieerde Firebase ID-token bepaalt de owner. Alleen
providerreferentie, library deck key en toegestane commandvelden komen uit de
clientrequest.

Wanneer de server via IAM/service-accounttoegang naar Firestore schrijft, gelden
Firestore Security Rules niet als primaire autorisatiegrens. Daarom moet de
applicatie zelf tenant-isolatie afdwingen en die grens met tests bewijzen.

De Game Worker gebruikt Firestore REST met een kortlevend OAuth-token. Het
service-account-JSON wordt uitsluitend uit `FIRESTORE_SERVICE_ACCOUNT_JSON`
gelezen. De adapter bouwt ieder pad zelf op uit de geverifieerde Firebase-UID en
een deck key; de client kan geen ownerpad aanleveren.

Voor lokale ontwikkeling mag dezelfde adapter zonder service-account naar de
Firestore Emulator schrijven. Dit pad vereist tegelijk `APP_ENV=development`
en een expliciete `FIRESTORE_EMULATOR_HOST` op `127.0.0.1` of `localhost`.
Andere hosts en iedere emulatorconfiguratie in staging/production worden
geweigerd. Daarmee is de lokale mogelijkheid geen productie-authbypass.

Een servercredential:

- staat uitsluitend in een Cloudflare Worker Secret of gelijkwaardige secret
  store;
- staat nooit in `.env.example`, GitHub Repository Variables, broncode,
  sourcemaps of runtime-config;
- wordt niet gelogd;
- wordt alleen via trusted deploymentcontext geprovisioned;
- krijgt zo weinig mogelijk Google Cloud/Firebase-rechten voor de benodigde
  Firestorebewerkingen.

## Data policy

Persistente librarydata bestaat uit eigen provider-neutrale MTG Battle Arena
records. Niet opslaan:

- Moxfield credential/User-Agent;
- ManaBox private endpoint- of requestkennis;
- raw providerresponses/captures;
- auth- of App Check-tokens;
- private providerfixtures.

Metadata en huidige content mogen gescheiden worden zodat `/decks` geen volledige
100-kaart snapshots hoeft te lezen. Een Delete moet alle actuele deckrecords die
bij die library-entry horen opruimen; gebruik daarvoor een gecontroleerde
servermutation/batch en test gedeeltelijke fouten.

## Duplicate isolation

Duplicate-identiteit is `uid + provider + externalDeckKey`. Gebruik een
atomair/deterministisch persistencepatroon zodat twee gelijktijdige Create-acties
niet twee records kunnen opleveren. Dit is geen `sourceHash` en is onafhankelijk
van de kaartinhoud.

## Online game-start

De client stuurt alleen een library deck key. De Game Worker controleert de UID en
haalt server-side de authoritative snapshot op. Een client mag niet een volledige
zelfgemaakte snapshot meesturen en daarmee Firestore/providercontroles omzeilen.

Na succesvolle game-initialisatie gebruikt de Game Durable Object zijn eigen
snapshot. Een latere library Update muteert die lopende game niet.

## Tests vóór enforcement

Test minimaal:

- gebruiker A kan metadata/content van gebruiker B niet lezen;
- unauthenticated reads falen;
- normale clientwrites falen;
- servermutations gebruiken uitsluitend de geverifieerde UID;
- duplicate Create is race-safe;
- gedeeltelijke update schrijft geen halve metadata/contentcombinatie;
- Delete ruimt de actuele records gecontroleerd op;
- App Check enforcement blokkeert niet-geldige webclienttoegang volgens rollout;
- logs/errors bevatten geen tokens, servercredentials of providerinternals.

Gebruik waar mogelijk de Firestore Emulator/Rules testomgeving voor regels; CI
mag geen productie-Firestoredata of echte providerrequests nodig hebben.
