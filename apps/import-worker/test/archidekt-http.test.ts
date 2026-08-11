import { expect, test, vi } from "vitest"
import {
  archidektDeckApiUrl,
  fetchArchidektJson,
} from "../src/providers/archidekt-http.ts"

test("volgt een Archidekt-redirect veilig met dezelfde client als beide importroutes", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://www.archidekt.com/api/decks/24765444/",
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ id: 24765444, name: "Primal Stampede" }),
    )

  await expect(
    fetchArchidektJson(archidektDeckApiUrl("24765444"), fetcher),
  ).resolves.toMatchObject({ data: { id: 24765444, name: "Primal Stampede" } })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: "GET",
    redirect: "manual",
  })
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    "https://www.archidekt.com/api/decks/24765444/",
  )
})

test("weigert redirects buiten de vaste Archidekt-hosts", async () => {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/deck" },
      }),
    ),
  )
  await expect(
    fetchArchidektJson(archidektDeckApiUrl("24765444"), fetcher),
  ).rejects.toMatchObject({
    name: "ArchidektHttpError",
    message: "Archidekt redirect werd geweigerd.",
  })
  expect(fetcher).toHaveBeenCalledOnce()
})
