import "@testing-library/jest-dom/vitest"

class ResizeObserverMock implements ResizeObserver {
  private readonly observed = new Set<Element>()

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
  }

  disconnect() {
    this.observed.clear()
  }
}

globalThis.ResizeObserver = ResizeObserverMock
globalThis.PointerEvent = MouseEvent as typeof PointerEvent

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))
