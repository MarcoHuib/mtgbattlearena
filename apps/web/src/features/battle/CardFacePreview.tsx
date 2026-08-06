import { useEffect, useState } from "react"
import type { CardDefinition } from "@mtg/game-core/types"
import { resolveCardImage } from "../../persistence/imageResolver"

type CardFacePreviewProps = {
  definition: CardDefinition
  initialFaceIndex: number
  online: boolean
}

export const CardFacePreview = ({
  definition,
  initialFaceIndex,
  online,
}: CardFacePreviewProps) => {
  const normalizedInitialFace = definition.faces[initialFaceIndex]
    ? initialFaceIndex
    : 0
  const [faceIndex, setFaceIndex] = useState(normalizedInitialFace)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const face = definition.faces[faceIndex] ?? definition.faces[0]
  const imageRef = definition.imageRefs.find(
    image => image.faceIndex === faceIndex,
  )
  const otherFaceIndex = faceIndex === 0 ? 1 : 0
  const otherFace = definition.faces[otherFaceIndex]
  const otherImage = definition.imageRefs.find(
    image => image.faceIndex === otherFaceIndex,
  )

  useEffect(() => {
    let active = true
    let revoke: (() => void) | undefined
    setLoading(true)
    setFailed(false)
    setImageUrl(null)
    void resolveCardImage(imageRef, online).then(resolved => {
      if (!active) {
        resolved?.revoke?.()
        return
      }
      revoke = resolved?.revoke
      setImageUrl(resolved?.url ?? null)
      setFailed(!resolved)
      setLoading(false)
    })
    return () => {
      active = false
      revoke?.()
    }
  }, [faceIndex, imageRef, online])

  return (
    <aside className="card-face-preview" aria-label="Grote kaartpreview">
      <div className="card-face-preview__status" aria-live="polite">
        Actieve previewzijde: {face?.name ?? definition.name}
      </div>
      <div className="card-face-preview__frame">
        {loading ? (
          <div
            className="card-face-preview__skeleton"
            aria-label="Kaartafbeelding laden"
          />
        ) : imageUrl && !failed ? (
          <img
            src={imageUrl}
            alt={`${face?.name ?? definition.name}, grote kaartpreview`}
            onError={() => {
              setFailed(true)
            }}
          />
        ) : (
          <div className="card-face-preview__error" role="status">
            <strong>{face?.name ?? definition.name}</strong>
            <span>Deze kaartzijde is niet als afbeelding beschikbaar.</span>
          </div>
        )}
        {definition.faces.length === 2 ? (
          <button
            className="card-face-preview__flip"
            type="button"
            disabled={!otherFace || !otherImage}
            aria-label={`Toon ${otherFace?.name ?? "andere kaartzijde"} in preview`}
            title={
              otherImage
                ? "Bekijk de andere kaartzijde"
                : "De andere kaartzijde is niet beschikbaar"
            }
            onClick={() => {
              setFaceIndex(otherFaceIndex)
            }}
          >
            ↻<span>Andere zijde bekijken</span>
          </button>
        ) : null}
      </div>
    </aside>
  )
}
