import { describeFirebaseAuthError, readFirebaseConfig } from "./firebaseAuth"

describe("Firebase webconfig", () => {
  test("maakt FirebaseOptions van een complete Vite-configuratie", () => {
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "project.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "project",
        VITE_FIREBASE_APP_ID: "app-id",
      }),
    ).toEqual({
      configured: true,
      options: {
        apiKey: "api-key",
        authDomain: "project.firebaseapp.com",
        projectId: "project",
        appId: "app-id",
      },
    })
  })

  test("rapporteert alle ontbrekende waarden zonder gedeeltelijk te starten", () => {
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "api-key",
        VITE_FIREBASE_AUTH_DOMAIN: " ",
      }),
    ).toEqual({
      configured: false,
      missing: [
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_APP_ID",
      ],
    })
  })

  test("vertaalt mobiele netwerk- en Firebase-fouten naar bruikbare tekst", () => {
    expect(describeFirebaseAuthError(new TypeError("Load failed"))).toBe(
      "Firebase kon niet worden bereikt. Controleer je verbinding en probeer opnieuw.",
    )
    expect(
      describeFirebaseAuthError({ code: "auth/operation-not-allowed" }),
    ).toBe("Deze inlogmethode staat nog niet aan in Firebase Authentication.")
  })
})
