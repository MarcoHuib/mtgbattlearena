# ADR 014 — Geserialiseerde providerqueue voor Moxfield-imports

## Status

Proposed — 13 augustus 2026.

## Context

De projectspecifieke Moxfield-toegang heeft een strikte provider-defined
requestlimiet. Een per-browser of per-Worker-isolate limiter is onvoldoende:
meerdere gebruikers of isolates kunnen dan alsnog gelijktijdig upstreamrequests
starten.

Omdat de Deck Library imports en updates expliciet user-triggered maakt, kan een
wachtrijstatus bovendien duidelijk in de UI worden weergegeven.

## Besluit

Alle Moxfield Import- en Update-operaties worden vóór iedere echte upstreamcall
via één singleton queue-coördinator per environment geserialiseerd.

Een Durable Object is de voorkeursimplementatie omdat één object de volgorde,
minimumafstand en duurzame jobstate centraal kan bewaken. Die jobstate is alleen
proces-/queue-state: de Firestore Deck Library uit ADR 016 blijft de duurzame
source of truth voor opgeslagen decks.

De queue hanteert minimaal:

- FIFO voor geaccepteerde jobs;
- maximaal één upstreamrequest tegelijk;
- een conservatieve minimumafstand van 1,1 seconde tussen starts van
  upstreamrequests;
- maximaal één queued/actieve job per geverifieerde gebruiker;
- een projectmatige 10-seconden-cooldown per gebruiker voor een nieuwe
  Moxfield Import/Update-actie;
- een upstreamtimeout van maximaal 10 seconden;
- foutafhandeling die de volgende geldige job niet permanent blokkeert;
- fail-closed gedrag bij ontbrekende vereiste serverconfiguratie.

Een provider- of rate-limitfout mag niet leiden tot een snelle automatische
retry-loop. Bij signalen dat de provider throttlet of blokkeert moet de queue
conservatief vertragen/pauzeren en een gecontroleerde fout retourneren.

## Clientcontract

Na acceptatie krijgt de client een provider-neutrale jobstatus. De UI mag
wachtrijpositie en een conservatieve indicatie van wachttijd tonen, maar behandelt
die indicatie niet als harde garantie. `completed` betekent dat providerfetch,
normalisatie én de bijbehorende Feature-1 Firestore Create/Update-mutation zijn
geslaagd.

Zolang dezelfde gebruiker een Moxfield-job heeft die `queued` of `processing` is,
worden nieuwe Moxfield Import/Update-acties uitgeschakeld of server-side
geweigerd.

## Security

De queue bewaart geen providercredential in clientzichtbare state. Credentials
worden uitsluitend server-side gelezen op het moment dat de provideradapter een
upstreamrequest uitvoert. Logs en foutpayloads bevatten geen gevoelige headers,
upstreamresponsebody of private integratiedetails.

## Teststrategie

De queue wordt eerst volledig tegen een mock upstream en gecontroleerde klok
getest. CI mag geen echte Moxfield-request uitvoeren.

Verplichte eigenschappen zijn onder andere burstserialisatie, FIFO, minimumtijd,
per-userdeduplicatie/cooldown, timeout, 4xx/5xx, provider-throttling,
her-instantiatie en de afwezigheid van een queue-bypass.

## Gevolgen

De maximale importdoorvoer is bewust lager dan technisch mogelijk. Dat is een
productkeuze om providerafspraken veilig af te dwingen. De Deck Library maakt de
wachttijd zichtbaar en voorkomt dat gebruikers door herhaald klikken onnodig
extra requests veroorzaken.
