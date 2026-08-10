import hostingConfig from "../../../firebase.json"
import {
  firebaseReservedNavigationDenylist,
  oauthPopupSecurityHeaders,
} from "./securityHeaders"

test("production en staging staan veilige OAuth-popups toe via COOP", () => {
  expect(oauthPopupSecurityHeaders).toEqual({
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  })

  for (const target of ["production", "staging"]) {
    const hosting = hostingConfig.hosting.find(entry => entry.target === target)
    expect(hosting?.headers).toEqual(
      expect.arrayContaining([
        {
          source: "**",
          headers: [
            {
              key: "Cross-Origin-Opener-Policy",
              value: "same-origin-allow-popups",
            },
          ],
        },
      ]),
    )
  }
})

test("de PWA-fallback onderschept geen gereserveerde Firebase-routes", () => {
  const isDenied = (path: string) =>
    firebaseReservedNavigationDenylist.some(pattern => pattern.test(path))

  expect(isDenied("/__/auth/handler")).toBe(true)
  expect(isDenied("/__/auth/iframe")).toBe(true)
  expect(isDenied("/__/firebase/init.json")).toBe(true)
  expect(isDenied("/online")).toBe(false)
})
