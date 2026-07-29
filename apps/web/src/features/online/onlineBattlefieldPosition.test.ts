import { positionForViewer } from "./onlineBattlefieldPosition"

test("behoudt een battlefieldpositie voor de eigenaar", () => {
  const position = { x: 0.72, y: 0.84, z: 3 }

  expect(positionForViewer(position, "self")).toEqual(position)
})

test("spiegelt een battlefieldpositie 180 graden voor de tegenstander", () => {
  const position = positionForViewer({ x: 0.72, y: 0.84, z: 3 }, "opponent")

  expect(position.x).toBeCloseTo(0.28)
  expect(position.y).toBeCloseTo(0.16)
  expect(position.z).toBe(3)
})
