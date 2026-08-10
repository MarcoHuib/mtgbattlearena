type AuthProviderIconProps = {
  provider: "google" | "microsoft"
}

export const AuthProviderIcon = ({ provider }: AuthProviderIconProps) =>
  provider === "google" ? (
    <svg
      className="auth-provider-icon"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285f4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.259h2.909c1.702-1.567 2.684-3.875 2.684-6.616Z"
      />
      <path
        fill="#34a853"
        d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.957v2.332A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#fbbc05"
        d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.707V4.961H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.039l3.006-2.332Z"
      />
      <path
        fill="#ea4335"
        d="M9 3.58c1.322 0 2.508.455 3.442 1.346l2.58-2.58C13.463.892 11.43 0 9 0A9 9 0 0 0 .957 4.961l3.006 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </svg>
  ) : (
    <svg
      className="auth-provider-icon"
      viewBox="0 0 21 21"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#f25022" d="M0 0h10v10H0z" />
      <path fill="#7fba00" d="M11 0h10v10H11z" />
      <path fill="#00a4ef" d="M0 11h10v10H0z" />
      <path fill="#ffb900" d="M11 11h10v10H11z" />
    </svg>
  )
