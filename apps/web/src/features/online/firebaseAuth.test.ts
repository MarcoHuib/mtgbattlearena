import {
  describeFirebaseAuthError,
  FederatedAccountLinker,
  readFirebaseConfig,
} from "./firebaseAuth"

describe("Firebase webconfig", () => {
  test("maakt FirebaseOptions van een complete Vite-configuratie", () => {
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: "api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "project.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "project",
        VITE_FIREBASE_APP_ID: "app-id",
        VITE_FIREBASE_MEASUREMENT_ID: "G-TEST123",
      }),
    ).toEqual({
      configured: true,
      options: {
        apiKey: "api-key",
        authDomain: "project.firebaseapp.com",
        projectId: "project",
        appId: "app-id",
        measurementId: "G-TEST123",
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
    expect(
      describeFirebaseAuthError({
        code: "auth/account-exists-with-different-credential",
      }),
    ).toContain("Log één keer in met Google")
    expect(
      describeFirebaseAuthError({ code: "auth/cancelled-popup-request" }),
    ).toContain("geannuleerd")
    expect(
      describeFirebaseAuthError({ code: "auth/credential-already-in-use" }),
    ).toContain("geen accounts samengevoegd")
  })
})

describe("veilige Google/Microsoft-accountkoppeling", () => {
  const googleUser = { uid: "existing-google-uid" }
  const microsoftCredential = { providerId: "microsoft.com", secret: "token" }
  const authError = (code: string) => Object.assign(new Error(code), { code })

  const setup = () => {
    const operations = {
      signInWithGoogle: vi.fn(() => Promise.resolve({ user: googleUser })),
      signInWithMicrosoft: vi.fn(() =>
        Promise.reject(
          authError("auth/account-exists-with-different-credential"),
        ),
      ),
      microsoftCredentialFromError: vi.fn(() => microsoftCredential),
      linkWithCredential: vi.fn(() => Promise.resolve()),
    }
    return {
      operations,
      linker: new FederatedAccountLinker(operations),
    }
  }

  test("bewaart Microsoft alleen in geheugen en linkt na Google aan dezelfde UID", async () => {
    const { linker, operations } = setup()

    await expect(linker.signInWithMicrosoft()).rejects.toMatchObject({
      code: "auth/account-exists-with-different-credential",
    })
    expect(linker.hasPendingMicrosoftCredential()).toBe(true)

    await linker.signInWithGoogle()

    expect(operations.linkWithCredential).toHaveBeenCalledExactlyOnceWith(
      googleUser,
      microsoftCredential,
    )
    expect(linker.hasPendingMicrosoftCredential()).toBe(false)
  })

  test.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "ruimt de pending credential op na %s",
    async code => {
      const { linker, operations } = setup()
      await expect(linker.signInWithMicrosoft()).rejects.toBeDefined()
      operations.signInWithGoogle.mockRejectedValueOnce(authError(code))

      await expect(linker.signInWithGoogle()).rejects.toMatchObject({
        code,
      })
      expect(operations.linkWithCredential).not.toHaveBeenCalled()
      expect(linker.hasPendingMicrosoftCredential()).toBe(false)
    },
  )

  test("weigert credentials van een ander account zonder accounts te mergen", async () => {
    const { linker, operations } = setup()
    await expect(linker.signInWithMicrosoft()).rejects.toBeDefined()
    operations.linkWithCredential.mockRejectedValueOnce(
      authError("auth/credential-already-in-use"),
    )

    await expect(linker.signInWithGoogle()).rejects.toMatchObject({
      code: "auth/credential-already-in-use",
    })
    expect(linker.hasPendingMicrosoftCredential()).toBe(false)
  })

  test("behandelt een reeds gekoppelde Microsoft-provider idempotent", async () => {
    const { linker, operations } = setup()
    await expect(linker.signInWithMicrosoft()).rejects.toBeDefined()
    operations.linkWithCredential.mockRejectedValueOnce(
      authError("auth/provider-already-linked"),
    )

    await expect(linker.signInWithGoogle()).resolves.toBeUndefined()
    expect(linker.hasPendingMicrosoftCredential()).toBe(false)
  })
})
