import {
  cardBoundsAtPointer,
  correctionForRelativePoint,
  dragCorrectionAfterScale,
  dragAnchorFromPointer,
  dragAnchorFromRelativePoint,
  fallbackBattlefieldPosition,
  positionForPerspective,
  positionFromDrop,
  relativePointInRectangle,
  safeBattlefieldPosition,
} from "./battlefieldPosition"

test("lijnt hetzelfde relatieve grijppunt opnieuw met de pointer uit", () => {
  const relativePoint = relativePointInRectangle(
    { left: 100, top: 50, width: 225, height: 150 },
    { x: 280, y: 140 },
  )

  expect(relativePoint).toEqual({ x: 0.8, y: 0.6 })
  expect(
    correctionForRelativePoint(
      { left: 400, top: 200, width: 150, height: 100 },
      { x: 610, y: 290 },
      relativePoint,
    ),
  ).toEqual({ x: 90, y: 30 })
})

test("houdt een vastgepakt punt onder de cursor wanneer hoverzoom verdwijnt", () => {
  const correction = dragCorrectionAfterScale(
    { left: 100, top: 50, width: 225, height: 150 },
    { x: 280, y: 140 },
    { x: 1.5, y: 1.5 },
  )

  expect(correction.x).toBeCloseTo(22.5)
  expect(correction.y).toBeCloseTo(5)
})

test("behoudt tijdens slepen exact het vastgepakte punt in de kaart", () => {
  const anchor = dragAnchorFromPointer(
    { left: 100, top: 50, width: 150, height: 225 },
    { x: 130, y: 95 },
    { x: 1.5, y: 1.5 },
  )

  expect(anchor).toEqual({
    offsetX: -30,
    offsetY: -45,
    width: 100,
    height: 150,
  })
  expect(cardBoundsAtPointer({ x: 700, y: 400 }, anchor)).toEqual({
    left: 680,
    top: 370,
    width: 100,
    height: 150,
  })
})

test("bouwt een draganker vanuit hetzelfde relatieve grijppunt", () => {
  const anchor = dragAnchorFromRelativePoint(
    { left: 400, top: 200, width: 150, height: 100 },
    { x: 0.8, y: 0.6 },
  )

  expect(anchor.offsetX).toBeCloseTo(45)
  expect(anchor.offsetY).toBeCloseTo(10)
  expect(anchor.width).toBe(150)
  expect(anchor.height).toBe(100)
})

test("normaliseert een drop ten opzichte van het battlefield", () => {
  expect(
    positionFromDrop(
      { left: 460, top: 260, width: 80, height: 120 },
      { left: 100, top: 100, width: 800, height: 400 },
      4,
    ),
  ).toEqual({ x: 0.5, y: 0.55, z: 4 })
})

test("houdt het kaartmidden met een compacte marge binnen het battlefield", () => {
  expect(
    positionFromDrop(
      { left: 40, top: 30, width: 100, height: 140 },
      { left: 100, top: 100, width: 500, height: 350 },
      2,
    ),
  ).toEqual({ x: 0.1, y: 1 / 7, z: 2 })
})

test("geeft een rechtop en getapt kaartformaat dezelfde randpositie", () => {
  const battlefield = { left: 100, top: 100, width: 800, height: 400 }
  const portrait = positionFromDrop(
    { left: 300, top: 30, width: 100, height: 140 },
    battlefield,
    3,
  )
  const tapped = positionFromDrop(
    { left: 280, top: 50, width: 140, height: 100 },
    battlefield,
    3,
  )

  expect(portrait).toEqual(tapped)
  expect(portrait).toEqual({ x: 0.3125, y: 0.125, z: 3 })
})

test("spreidt oude kaarten zonder opgeslagen positie veilig uit", () => {
  expect(fallbackBattlefieldPosition(0, 4)).toEqual({
    x: 1 / 6,
    y: 0.25,
    z: 1,
  })
  expect(safeBattlefieldPosition({ x: 2, y: -1, z: -3 })).toEqual({
    x: 1,
    y: 0,
    z: 0,
  })
})

test("spiegelt de positie voor het tegenoverliggende spelersbord", () => {
  const position = positionForPerspective(
    { x: 0.72, y: 0.84, z: 3 },
    "opponent",
  )

  expect(position.x).toBeCloseTo(0.28)
  expect(position.y).toBeCloseTo(0.16)
  expect(position.z).toBe(3)
})
