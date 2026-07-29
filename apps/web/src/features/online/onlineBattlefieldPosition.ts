type NormalizedBattlefieldPosition = {
  x: number
  y: number
  z: number
}

export const positionForViewer = (
  position: NormalizedBattlefieldPosition,
  perspective: "self" | "opponent",
): NormalizedBattlefieldPosition =>
  perspective === "opponent"
    ? {
        x: 1 - position.x,
        y: 1 - position.y,
        z: position.z,
      }
    : position
