import { randomCode } from "../src/lobby-durable-object"

const fillFrom = (...values: number[]) => {
  let index = 0
  return (bytes: Uint8Array) => {
    bytes.fill(255)
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
      if (index >= values.length) break
      bytes[byteIndex] = values[index] ?? 255
      index += 1
    }
    return bytes
  }
}

describe("randomCode", () => {
  test("mapt geaccepteerde random bytes gelijkmatig op het joincode-alfabet", () => {
    expect(randomCode(4, fillFrom(0, 31, 32, 223))).toBe("A9A9")
  })

  test("verwerpt bytes buiten het onbevooroordeelde bereik", () => {
    expect(randomCode(2, fillFrom(224, 255, 1, 30))).toBe("B8")
  })

  test("valideert de gevraagde lengte", () => {
    expect(randomCode(0, fillFrom())).toBe("")
    expect(() => randomCode(-1, fillFrom())).toThrow(RangeError)
    expect(() => randomCode(1.5, fillFrom())).toThrow(RangeError)
  })
})
