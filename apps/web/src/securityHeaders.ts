export const oauthPopupSecurityHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
} as const

// Firebase Hosting owns this namespace for its Authentication helpers and
// other reserved resources. These navigations must reach Hosting instead of
// being replaced with the cached SPA shell by Workbox.
export const firebaseReservedNavigationDenylist = [/^\/__\//]
