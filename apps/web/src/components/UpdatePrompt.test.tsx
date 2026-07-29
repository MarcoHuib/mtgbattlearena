import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { checkForServiceWorkerUpdate, UpdatePrompt } from "./UpdatePrompt"

vi.mocked(useRegisterSW).mockReturnValue({
  needRefresh: [true, vi.fn()],
  offlineReady: [false, vi.fn()],
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
})

describe("UpdatePrompt", () => {
  it("installeert een wachtende update na bevestiging", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useRegisterSW).mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    })

    render(<UpdatePrompt />)
    fireEvent.click(screen.getByRole("button", { name: "Nu bijwerken" }))

    await waitFor(() => {
      expect(updateServiceWorker).toHaveBeenCalledWith(true)
    })
  })

  it("controleert het service-workerbestand zonder browsercache", async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }))

    await checkForServiceWorkerUpdate({
      registration: {
        installing: null,
        update,
      } as unknown as ServiceWorkerRegistration,
      swUrl: "/sw.js",
    })

    expect(fetchMock).toHaveBeenCalledWith("/sw.js", {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
      },
    })
    expect(update).toHaveBeenCalledOnce()
  })
})
