import type { Placement } from './types'

/** Where the tour box goes beside the highlighted element. Pure, so it is tested without a browser. */

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}
export interface Size {
  width: number
  height: number
}

/** Below this width the box docks at the bottom of the screen instead of floating beside the element. */
export const NARROW = 640
/** Space between the element and the box, and between the box and the screen edge. */
export const GAP = 14
export const EDGE = 16
/** The highlight sits this far outside the element. */
export const HOLE_PAD = 6

export type BoxPlace = { mode: 'sheet' } | { mode: 'float'; top: number; left: number; side: Exclude<Placement, 'auto'> | 'center' | 'over' }

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const

export function placeBox(target: Rect | null, box: Size, screen: Size, want: Placement = 'auto'): BoxPlace {
  if (screen.width < NARROW) return { mode: 'sheet' }
  if (!target) return { mode: 'float', side: 'center', top: Math.max(EDGE, (screen.height - box.height) / 2), left: Math.max(EDGE, (screen.width - box.width) / 2) }

  const right = target.left + target.width
  const bottom = target.top + target.height
  const fits = {
    bottom: bottom + GAP + box.height <= screen.height - EDGE,
    top: target.top - GAP - box.height >= EDGE,
    right: right + GAP + box.width <= screen.width - EDGE,
    left: target.left - GAP - box.width >= EDGE,
  }
  const order: (keyof typeof fits)[] = want === 'auto' ? ['bottom', 'top', 'right', 'left'] : [want, OPPOSITE[want], 'bottom', 'top', 'right', 'left']
  const side = order.find((s) => fits[s])

  const midX = clamp(target.left + target.width / 2 - box.width / 2, EDGE, screen.width - box.width - EDGE)
  const midY = clamp(target.top + target.height / 2 - box.height / 2, EDGE, screen.height - box.height - EDGE)
  switch (side) {
    case 'bottom':
      return { mode: 'float', side, top: bottom + GAP, left: midX }
    case 'top':
      return { mode: 'float', side, top: target.top - GAP - box.height, left: midX }
    case 'right':
      return { mode: 'float', side, top: midY, left: right + GAP }
    case 'left':
      return { mode: 'float', side, top: midY, left: target.left - GAP - box.width }
    default:
      // A large element (a whole list): the box sits over its lower right corner, inside the screen.
      return { mode: 'float', side: 'over', top: clamp(screen.height - box.height - EDGE * 2, EDGE, screen.height), left: clamp(screen.width - box.width - EDGE * 2, EDGE, screen.width) }
  }
}

/** Where a floating box would sit, as a rectangle. */
export function boxRect(place: BoxPlace, size: Size): Rect | null {
  return place.mode === 'float' ? { top: place.top, left: place.left, width: size.width, height: size.height } : null
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * The compact box's corner while the person works in a dialog: the screen corner that covers least of it (ties go to
 * the bottom left, where dialogs keep the least: their buttons sit at the bottom right).
 */
export function cornerFor(obstacle: Rect, size: Size, screen: Size): { top: number; left: number } {
  const corners = [
    { top: screen.height - size.height - EDGE, left: EDGE },
    { top: screen.height - size.height - EDGE, left: screen.width - size.width - EDGE },
    { top: EDGE, left: EDGE },
    { top: EDGE, left: screen.width - size.width - EDGE },
  ]
  let best = corners[0]!
  let bestArea = Infinity
  for (const c of corners) {
    const area = overlapArea({ ...c, ...size }, obstacle)
    if (area < bestArea) {
      best = c
      bestArea = area
    }
  }
  return best
}

/** The highlight: the element plus a little room, kept on the screen. */
export function holeRect(target: Rect, screen: Size): Rect {
  const top = Math.max(target.top - HOLE_PAD, 4)
  const left = Math.max(target.left - HOLE_PAD, 4)
  const bottom = Math.min(target.top + target.height + HOLE_PAD, screen.height - 4)
  const right = Math.min(target.left + target.width + HOLE_PAD, screen.width - 4)
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Whether the element is far enough on screen to read, or should be scrolled to first. */
export function needsScroll(target: Rect, screen: Size, topReserved = 72): boolean {
  const visibleTop = Math.max(target.top, topReserved)
  const visibleBottom = Math.min(target.top + target.height, screen.height)
  const shown = visibleBottom - visibleTop
  return shown < Math.min(target.height, screen.height - topReserved) * 0.6
}
