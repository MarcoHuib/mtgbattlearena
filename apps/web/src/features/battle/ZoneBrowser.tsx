import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { PlayerId, Zone } from "@mtg/game-core/types"
import {
  moveCardInLibrary,
  moveGameCards,
  shufflePlayerLibrary,
} from "../game/gameSlice"
import { CardView } from "./CardView"

type BrowsableZone = Extract<
  Zone,
  "library" | "graveyard" | "exile" | "command"
>

type ZoneBrowserProps = {
  playerId: PlayerId
  zone: BrowsableZone
  initialSearch?: boolean
  initialTopAmount?: number
  onClose: () => void
}

const labels: Record<BrowsableZone, string> = {
  library: "Library",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
}

const destinations: { zone: Zone; label: string }[] = [
  { zone: "hand", label: "Hand" },
  { zone: "battlefield", label: "Battlefield" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "command", label: "Command zone" },
  { zone: "library", label: "Library" },
]
const emptyZoneIds: string[] = []

export const ZoneBrowser = ({
  playerId,
  zone,
  initialSearch = false,
  initialTopAmount,
  onClose,
}: ZoneBrowserProps) => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [sort, setSort] = useState<"zone" | "name" | "mana">("zone")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [topAmount, setTopAmount] = useState(initialTopAmount ?? 7)
  const [topOnly, setTopOnly] = useState(initialTopAmount !== undefined)
  const [selected, setSelected] = useState<string[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab" || !dialogRef.current) return
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", closeOnEscape)
    ;(initialSearch ? searchRef.current : dialogRef.current)?.focus()
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [initialSearch, onClose])

  const zoneIds = game?.players[playerId].zones[zone] ?? emptyZoneIds
  const visibleIds = useMemo(() => {
    const topIds =
      zone === "library" && topOnly
        ? zoneIds.slice(-Math.max(0, topAmount)).reverse()
        : [...zoneIds]
    const filtered = topIds.filter(instanceId => {
      const card = game?.cardsById[instanceId]
      const definition = card
        ? game?.cardDefinitionsById[card.definitionId]
        : undefined
      const typeLine =
        definition?.typeLine ?? definition?.faces[0]?.typeLine ?? ""
      return (
        (query.trim() === "" ||
          definition?.name
            .toLowerCase()
            .includes(query.trim().toLowerCase())) &&
        (typeFilter === "" ||
          typeLine.toLowerCase().includes(typeFilter.toLowerCase()))
      )
    })
    if (sort === "name") {
      filtered.sort((firstId, secondId) => {
        const first = game?.cardsById[firstId]
        const second = game?.cardsById[secondId]
        return (
          game?.cardDefinitionsById[
            first?.definitionId ?? ""
          ]?.name.localeCompare(
            game?.cardDefinitionsById[second?.definitionId ?? ""]?.name ?? "",
          ) ?? 0
        )
      })
    } else if (sort === "mana") {
      filtered.sort((firstId, secondId) => {
        const first = game?.cardsById[firstId]
        const second = game?.cardsById[secondId]
        return (
          (game?.cardDefinitionsById[first?.definitionId ?? ""]?.manaValue ??
            Number.POSITIVE_INFINITY) -
          (game?.cardDefinitionsById[second?.definitionId ?? ""]?.manaValue ??
            Number.POSITIVE_INFINITY)
        )
      })
    }
    return filtered
  }, [game, query, sort, topAmount, topOnly, typeFilter, zone, zoneIds])

  const moveSelected = (destination: Zone) => {
    if (!game || selected.length === 0) return
    dispatch(
      moveGameCards({
        moves: selected.map(instanceId => ({
          instanceId,
          playerId,
          zone: destination,
        })),
      }),
    )
    setSelected([])
  }

  return createPortal(
    <div
      className="zone-browser-layer"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="zone-browser"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`zone-browser-title-${playerId}-${zone}`}
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">{game?.players[playerId].name}</span>
            <h2 id={`zone-browser-title-${playerId}-${zone}`}>
              {labels[zone]} bekijken
            </h2>
          </div>
          <button
            type="button"
            aria-label="Zonebrowser sluiten"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="zone-browser__tools">
          <label>
            <span>Zoek op kaartnaam</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={event => {
                setQuery(event.target.value)
              }}
            />
          </label>
          <label>
            <span>Kaarttype</span>
            <input
              value={typeFilter}
              placeholder="bijv. Creature"
              onChange={event => {
                setTypeFilter(event.target.value)
              }}
            />
          </label>
          <label>
            <span>Sorteren</span>
            <select
              value={sort}
              onChange={event => {
                setSort(event.target.value as "zone" | "name" | "mana")
              }}
            >
              <option value="zone">Zonevolgorde</option>
              <option value="name">Naam</option>
              <option value="mana">Mana value</option>
            </select>
          </label>
          <div className="segmented-control" aria-label="Weergave">
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => {
                setView("grid")
              }}
            >
              Grid
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => {
                setView("list")
              }}
            >
              Lijst
            </button>
          </div>
        </div>

        {zone === "library" ? (
          <div className="zone-browser__library-tools">
            <label>
              <input
                type="checkbox"
                checked={topOnly}
                onChange={event => {
                  setTopOnly(event.target.checked)
                }}
              />
              Bekijk alleen de bovenste
            </label>
            <input
              aria-label="Aantal bovenste kaarten"
              type="number"
              min={1}
              max={zoneIds.length || 1}
              value={topAmount}
              onChange={event => {
                setTopAmount(Number(event.target.value))
              }}
            />
            {query.trim() ? (
              <>
                <span>Zoeken schudt niet automatisch.</span>
                <button
                  type="button"
                  onClick={() =>
                    dispatch(
                      shufflePlayerLibrary({
                        playerId,
                        seed: Date.now(),
                      }),
                    )
                  }
                >
                  Library nu schudden
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="zone-browser__selection" aria-live="polite">
            <strong>{selected.length} geselecteerd</strong>
            <select
              aria-label="Verplaats geselecteerde kaarten"
              defaultValue=""
              onChange={event => {
                moveSelected(event.target.value as Zone)
              }}
            >
              <option value="" disabled>
                Verplaats naar…
              </option>
              {destinations
                .filter(item => item.zone !== zone)
                .map(item => (
                  <option key={item.zone} value={item.zone}>
                    {item.label}
                  </option>
                ))}
            </select>
            {zone === "library" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    selected.forEach(instanceId =>
                      dispatch(
                        moveCardInLibrary({
                          instanceId,
                          playerId,
                          position: "top",
                        }),
                      ),
                    )
                    setSelected([])
                  }}
                >
                  Bovenop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ;[...selected].reverse().forEach(instanceId =>
                      dispatch(
                        moveCardInLibrary({
                          instanceId,
                          playerId,
                          position: "bottom",
                        }),
                      ),
                    )
                    setSelected([])
                  }}
                >
                  Onderop
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className={`zone-browser__cards zone-browser__cards--${view}`}>
          {visibleIds.map(instanceId => {
            const instance = game?.cardsById[instanceId]
            const definition = instance
              ? game?.cardDefinitionsById[instance.definitionId]
              : undefined
            if (!instance || !definition) return null
            const checked = selected.includes(instanceId)
            return (
              <div
                key={instanceId}
                className={`zone-browser__item ${checked ? "is-selected" : ""}`}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelected(current =>
                        current.includes(instanceId)
                          ? current.filter(id => id !== instanceId)
                          : [...current, instanceId],
                      )
                    }}
                  />
                  <span className="sr-only">Selecteer {definition.name}</span>
                </label>
                <CardView
                  instance={instance}
                  definition={definition}
                  compact={view === "grid"}
                  disableDrag
                />
                <div>
                  <strong>{definition.name}</strong>
                  <span>
                    {definition.typeLine ?? definition.faces[0]?.typeLine}
                  </span>
                  {definition.manaValue !== undefined ? (
                    <small>MV {definition.manaValue}</small>
                  ) : null}
                </div>
              </div>
            )
          })}
          {visibleIds.length === 0 ? (
            <p className="zone-browser__empty">
              {zoneIds.length === 0
                ? `${labels[zone]} is leeg.`
                : "Geen kaarten voldoen aan deze zoekopdracht."}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
