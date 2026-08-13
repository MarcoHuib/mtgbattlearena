# Firebase App Check

Firebase App Check is an extra client-attestation layer; it does not replace
Firebase Authentication, authorization, rate limits, socket tickets, command
validation, or the server-authoritative Durable Objects.

```text
Browser application requests
  -> Firebase Auth ID token + Firebase App Check token
  -> Cloudflare Game Worker
  -> authentication -> App Check -> rate limits -> authorization
  -> Lobby/Game Durable Object or private Import Worker binding

Browser card-image requests
  -> cdn.mtgbattlearena.nl
  -> public constrained Image Worker
  -> cards.scryfall.io
```

The web client uses Firebase App Check with
`ReCaptchaEnterpriseProvider`, automatic token refresh, and cached tokens
(`getToken(appCheck, false)`). Protected requests add
`X-Firebase-AppCheck`; authenticated requests continue to add
`Authorization: Bearer ...` independently.

## Endpoint policy

- Public: `GET /api/online/health` en CORS `OPTIONS` op de application-API.
  Kaartafbeeldingen zijn een afzonderlijke publieke CDN-grens en geen Game
  Worker/App Check-endpoint.
- App Check: public lobby listing, GraphQL-deckimport en begrensde provider-importrequests en iedere
  beschermde application-API-operatie volgens de ingestelde enforcementmodus.
- Auth plus App Check: lobby mutations, game APIs, and
  `POST /api/online/socket-ticket`.
- WebSocket upgrade: the existing short-lived, single-use ticket remains the
  credential. App Check is checked before ticket issuance and is not repeated
  for each frame.

Native `<img>` requests cannot attach a custom App Check header, so images are
intentionally outside the Game Worker. `cdn.mtgbattlearena.nl` accepts only the
versioned ImageRef route, resolver 1, UUID printing IDs, face 0/1 and `normal`.
The Image Worker has a fixed Scryfall allowlist, safe redirect validation,
timeout/response-size/JPEG checks and public edge caching. It accepts no Firebase
identity, cookies or arbitrary upstream URL. The Import Worker remains private
behind its Service Binding and is not an image proxy.

## Server verification

The Game Worker verifies App Check JWTs cryptographically with WebCrypto and
Firebase's fixed official JWKS endpoint. Only `RS256` and `typ: JWT` are
accepted. It validates signature, `exp`, sensible `iat`, the configured project
number in `iss` and `aud`, and an exact `sub` match in
`FIREBASE_ALLOWED_APP_IDS`. Keys follow response cache headers (capped at six
hours); an unknown `kid` can trigger at most one refresh per minute. Verification
fails closed in `enforce` mode and never derives a trusted endpoint from token
claims.

`APP_CHECK_ENFORCEMENT` supports:

- `off`: emergency rollback; all existing controls remain active.
- `monitor`: verify and log safely, but do not block.
- `enforce`: reject missing/invalid App Check with generic HTTP 403
  `APP_CHECK_REQUIRED`.

Unknown mode values fail safe as `enforce`. Production starts in `monitor`;
staging uses `enforce`. Logs contain only the result/reason, environment, route,
request ID, auth-presence flag, and mode—never tokens or decoded claims.

## Configuration and environment isolation

Frontend runtime variable (public, not a secret):

```text
FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY=<site-key>
```

Game Worker variables (also not secrets):

```text
APP_CHECK_ENFORCEMENT=monitor|enforce|off
FIREBASE_PROJECT_NUMBER=<numeric-project-number>
FIREBASE_ALLOWED_APP_IDS=<comma-separated-exact-app-ids>
APP_ENV=staging|production
```

Configure these as GitHub Environment Variables in both `staging` and
`production`. No service-account key is required. Debug tokens are sensitive
and must never be committed.

At present Authentication is shared through Firebase project
`mtgbattlearena`. Strict beta-to-production App Check isolation additionally
requires a separate Firebase Web App registration/App ID for beta. Set
`FIREBASE_APP_ID` and `FIREBASE_ALLOWED_APP_IDS` to the beta App ID in
`staging`, and to the production App ID in `production`. If both environments
retain the same App ID, tokens are cryptographically valid in both and this
particular isolation guarantee cannot exist.

## Firebase and Google Cloud setup

1. In Firebase Console, open **App Check > Apps**.
2. Select the production Web App and register **reCAPTCHA Enterprise**.
3. Use a score-based reCAPTCHA Enterprise web key and allow the production
   domains. Put its public site key in the production GitHub Environment.
4. Register a separate beta Firebase Web App if environment token isolation is
   required. Register App Check for it with a beta-domain Enterprise key and
   put its App ID/site key in the staging Environment.
5. For local real-backend testing, run the development build. It enables only
   Firebase's official debug provider (`self.FIREBASE_APPCHECK_DEBUG_TOKEN =
   true`). Register the token printed once by Firebase under **App Check >
   Manage debug tokens**. Never commit or share it.
6. Do not enable Firebase Authentication App Check enforcement yet. That
   preview/native-Firebase switch is separate from this custom-backend rollout.

At present the deployed application does not directly use Firestore, Realtime
Database, or Firebase Storage, so no native-service enforcement is configured.
Roadmap Feature 1 introduces direct owner-scoped Firestore reads for the Deck
Library. Before that becomes production-authoritative, configure Firestore
Security Rules and App Check enforcement/test coverage as described in
`docs/security/firestore-deck-library.md`. Realtime Database and Firebase Storage
remain outside this scope. Existing CSP changes must stay narrowly scoped; do not
add wildcards, `unsafe-eval` or unrelated COOP weakening.

## Rollout and troubleshooting

Deploy staging with `enforce`, test login, imports, lobby operations and a full
socket-ticket/reconnect flow. Deploy production with `monitor`, inspect
`app_check_valid`/`app_check_invalid` structured logs, then change only the
production Environment variable to `enforce` and redeploy.

- HTTP 401: Firebase Authentication is missing or invalid.
- HTTP 403 `APP_CHECK_REQUIRED`: App Check is missing, expired, malformed,
  signed by an untrusted key, or has the wrong project/App ID.
- Local 403: register the Firebase-generated debug token and confirm the real
  backend/runtime config is enabled.
- Wrong-app failures: compare the frontend `FIREBASE_APP_ID` with the backend's
  exact allowlist for that GitHub Environment.
- Token acquisition failures are surfaced as a generic Dutch connectivity/
  security message and do not enter an infinite retry loop.

Firebase's JS SDK caches and refreshes client tokens. The Worker caches public
keys. Therefore neither reCAPTCHA nor JWKS is fetched anew for every API call.
