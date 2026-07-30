import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import type {
  BattlefieldPosition,
  CardDefinition,
  PlayerId,
} from "@mtg/game-core/types"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import { resolveCardImage } from "../../persistence/imageResolver"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"

type MenuPoint = {
  x: number
  y: number
}

type ZoneActionMenuProps = {
  playerId: PlayerId
  kind: "library" | "battlefield"
  point: MenuPoint
  battlefieldPosition?: BattlefieldPosition
  onBrowseLibrary: (options?: { search?: boolean; topAmount?: number }) => void
  onClose: () => void
}

const menuStyle = ({ x, y }: MenuPoint): CSSProperties => {
  const width = Math.min(360, window.innerWidth - 24)
  const height = Math.min(650, window.innerHeight - 24)
  return {
    width,
    left:
      x + width + 12 <= window.innerWidth ? x + 6 : Math.max(12, x - width - 6),
    top: Math.max(12, Math.min(y - 18, window.innerHeight - height - 12)),
    maxHeight: height,
  }
}

const tokenStats = (power?: number, toughness?: number) =>
  power === undefined || toughness === undefined ? "" : `${power}/${toughness}`

const TokenThumbnail = ({ definition }: { definition: CardDefinition }) => {
  const online = useOnlineStatus()
  const image = definition.imageRefs.find(item => item.faceIndex === 0)
  const [imageUrl, setImageUrl] = useState<string | null>(
    online ? (image?.url ?? null) : null,
  )

  useEffect(() => {
    let active = true
    let revoke: (() => void) | undefined
    void resolveCardImage(image, online).then(resolved => {
      if (!active) {
        resolved?.revoke?.()
        return
      }
      revoke = resolved?.revoke
      setImageUrl(resolved?.url ?? null)
    })
    return () => {
      active = false
      revoke?.()
    }
  }, [image, online])

  return imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="zone-action-menu__token-fallback">
      {definition.name.slice(0, 1)}
    </span>
  )
}

export const ZoneActionMenu = ({
  playerId,
  kind,
  point,
  battlefieldPosition,
  onBrowseLibrary,
  onClose,
}: ZoneActionMenuProps) => {
  const runtime = useBattleRuntime()
  const { actions, game } = runtime
  const [amount, setAmount] = useState(1)
  const [showTokens, setShowTokens] = useState(kind === "battlefield")
  const menuRef = useRef<HTMLDivElement>(null)

  const tokenDefinitions = useMemo(
    () =>
      Object.values(game.cardDefinitionsById)
        .filter(
          definition =>
            (runtime.mode === "online" ||
              definition.id.startsWith(`${playerId}:`)) &&
            definition.token?.source === "deck",
        )
        .sort((first, second) => first.name.localeCompare(second.name)),
    [game.cardDefinitionsById, playerId, runtime.mode],
  )

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose])

  if (!canControlPlayer(runtime, playerId)) return null
  const normalizedAmount = Math.max(1, Math.min(99, Math.floor(amount) || 1))
  const nextZ =
    Math.max(
      0,
      ...game.players[playerId].zones.battlefield.map(
        instanceId => game.cardsById[instanceId]?.position?.z ?? 0,
      ),
    ) + 1

  const addToken = (definitionId: string) => {
    const definition = game.cardDefinitionsById[definitionId]
    if (!definition) return
    actions.createToken(playerId, definition, {
      x: battlefieldPosition?.x ?? 0.5,
      y: battlefieldPosition?.y ?? 0.5,
      z: nextZ,
    })
    onClose()
  }

  return createPortal(
    <div
      className="zone-action-layer"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={menuRef}
        className="zone-action-menu"
        style={menuStyle(point)}
        role="dialog"
        aria-modal="true"
        aria-label={kind === "library" ? "Libraryacties" : "Battlefieldacties"}
      >
        <header>
          <strong>
            {kind === "library" ? "Libraryacties" : "Tafelacties"}
          </strong>
          <button
            type="button"
            aria-label="Actiemenu sluiten"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {kind === "library" ? (
          <>
            <button
              type="button"
              onClick={() => {
                actions.drawCards(playerId, 1)
                onClose()
              }}
            >
              <span aria-hidden="true">→</span> Trek een kaart
            </button>
            <div className="zone-action-menu__amount">
              <label>
                <span>Aantal</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={amount}
                  onChange={event => {
                    setAmount(event.target.valueAsNumber || 1)
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  actions.drawCards(playerId, normalizedAmount)
                  onClose()
                }}
              >
                Trek X
              </button>
              <button
                type="button"
                onClick={() => {
                  actions.millCards(playerId, normalizedAmount)
                  onClose()
                }}
              >
                Mill X
              </button>
            </div>
            <div className="zone-action-menu__separator" />
            <button
              type="button"
              onClick={() => {
                onBrowseLibrary()
                onClose()
              }}
            >
              <span aria-hidden="true">▦</span> Bekijk library
            </button>
            <button
              type="button"
              onClick={() => {
                onBrowseLibrary({ search: true })
                onClose()
              }}
            >
              <span aria-hidden="true">⌕</span> Zoek library
            </button>
            <button
              type="button"
              onClick={() => {
                onBrowseLibrary({ topAmount: normalizedAmount })
                onClose()
              }}
            >
              <span aria-hidden="true">◉</span> Bekijk bovenste X
            </button>
            <button
              type="button"
              onClick={() => {
                actions.shuffleLibrary(playerId)
                onClose()
              }}
            >
              <span aria-hidden="true">⤨</span> Schud library
            </button>
            <button
              type="button"
              onClick={() => {
                actions.mulligan(playerId)
                onClose()
              }}
            >
              <span aria-hidden="true">↻</span> Mulligan
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                actions.untapAll(playerId)
                onClose()
              }}
            >
              <span aria-hidden="true">↶</span> Untap alles
            </button>
            <button
              type="button"
              aria-expanded={showTokens}
              onClick={() => {
                setShowTokens(value => !value)
              }}
            >
              <span aria-hidden="true">＋</span> Token toevoegen
              <span aria-hidden="true">{showTokens ? "▾" : "▸"}</span>
            </button>
            {showTokens ? (
              <div className="zone-action-menu__tokens">
                {tokenDefinitions.map(definition => {
                  return (
                    <button
                      type="button"
                      key={definition.id}
                      onClick={() => {
                        addToken(definition.id)
                      }}
                    >
                      <TokenThumbnail definition={definition} />
                      <span>
                        <strong>{definition.name}</strong>
                        <small>
                          {tokenStats(
                            definition.token?.power,
                            definition.token?.toughness,
                          )}
                        </small>
                      </span>
                    </button>
                  )
                })}
                {tokenDefinitions.length === 0 ? (
                  <p>
                    Voor dit deck zijn geen bekende tokenkaarten meegeleverd.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
