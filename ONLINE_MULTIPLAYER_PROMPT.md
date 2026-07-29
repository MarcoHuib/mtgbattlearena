Lees `AGENTS.md` en `docs/architecture/006-online-multiplayer.md` volledig; deze bestanden zijn leidend. Inspecteer daarna de bestaande repository en implementeer de online uitbreiding incrementeel zonder de bestaande offline gameflow, autosave, undo/redo, Archidekt-import of offlinepakketten te breken.

Voer in deze opdracht uit:

1. Voeg een hoofdmenu en routing toe voor **Offline spelen**, **Online spelen**, **Decks beheren**, **Spel hervatten** en **Instellingen**. Offline moet zonder login en zonder backend blijven werken.
2. Maak online schermen voor loginstatus, openbare lobby’s, game aanmaken en deelnemen met code. Gebruik eerst realistische mocks wanneer echte configuratie of secrets ontbreken.
3. Introduceer interfaces/adapters voor `AuthService`, `OnlineGameService` en offline/online `GameCommandDispatcher`; componenten mogen Firebase en Cloudflare niet rechtstreeks aanroepen.
4. Maak spelers in nieuwe online modellen generiek voor 2–6 spelers, met 4 als Commander-standaard. Hardcode geen `player1/player2` in nieuwe domein- of protocolcode.
5. Voeg een gedeeld TypeScript-protocol met runtimevalidatie toe voor commands, persoonlijke snapshots, serverevents en errors. Online clientstate mag nooit verborgen hand- of librarydata van tegenstanders bevatten.
6. Leg de TypeScript Cloudflare Worker-basis aan voor Firebase ID-tokenvalidatie, een SQLite-backed Lobby Durable Object, kortlevende eenmalige WebSocket-tickets en één SQLite-backed Durable Object per game. Gebruik mocks/fixtures wanneer deploymentbindings of secrets ontbreken; commit geen secrets.
7. Voeg relevante tests toe en voer formattering, lint, typecheck, tests en productiebuild uit.

Werk bestaande patronen door in plaats van een parallelle app te bouwen. Bouw geen rules engine, matchmaking, chat/video of cloudsync voor offline savegames. Rapporteer na afloop gewijzigde bestanden, uitgevoerde controles, resterende mocks/configuratie en de eerstvolgende technische stap.
