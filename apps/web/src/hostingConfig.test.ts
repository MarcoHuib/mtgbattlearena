import hostingConfig from "../../../firebase.json"
import { oauthPopupSecurityHeaders } from "./securityHeaders"

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
