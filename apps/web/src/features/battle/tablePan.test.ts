import { tableCameraPanDelta } from "./tablePan"

describe("tableCameraPanDelta", () => {
  it("routeert beide trackpadassen naar de gedeelde camera", () => {
    expect(tableCameraPanDelta({ deltaX: 80, deltaY: 20 })).toEqual({
      x: 80,
      y: 20,
    })
    expect(tableCameraPanDelta({ deltaX: 10, deltaY: 100 })).toEqual({
      x: 10,
      y: 100,
    })
  })

  it("routeert zuiver verticale input naar de globale camera", () => {
    expect(tableCameraPanDelta({ deltaX: 0, deltaY: 100 })).toEqual({
      x: 0,
      y: 100,
    })
  })

  it("ondersteunt shift-wheel maar onderschept browserzoom niet", () => {
    expect(
      tableCameraPanDelta({ deltaX: 0, deltaY: 60, shiftKey: true }),
    ).toEqual({ x: 60, y: 0 })
    expect(
      tableCameraPanDelta({ deltaX: 80, deltaY: 0, ctrlKey: true }),
    ).toBeNull()
  })
})
