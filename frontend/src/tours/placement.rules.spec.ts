import { describe, expect, it } from 'vitest'
import { boxRect, cornerFor, EDGE, GAP, holeRect, needsScroll, overlapArea, placeBox } from './placement.rules'

const screen = { width: 1440, height: 900 }
const box = { width: 360, height: 200 }

describe('where the tour box goes', () => {
  it('sits under the element, centred on it, when there is room', () => {
    expect(placeBox({ top: 100, left: 500, width: 200, height: 40 }, box, screen)).toEqual({ mode: 'float', side: 'bottom', top: 140 + GAP, left: 420 })
  })

  it('goes above when the element is near the bottom', () => {
    expect(placeBox({ top: 800, left: 500, width: 200, height: 40 }, box, screen)).toMatchObject({ side: 'top', top: 800 - GAP - 200 })
  })

  it('goes beside a tall element such as the menu rail', () => {
    expect(placeBox({ top: 12, left: 12, width: 56, height: 876 }, box, screen)).toMatchObject({ side: 'right', left: 68 + GAP })
  })

  it('stays inside the screen at the edges', () => {
    const place = placeBox({ top: 20, left: 1400, width: 30, height: 30 }, box, screen)
    expect(place).toMatchObject({ side: 'bottom', left: screen.width - box.width - EDGE })
  })

  it('takes the side asked for when it fits, the opposite when not', () => {
    expect(placeBox({ top: 300, left: 600, width: 100, height: 40 }, box, screen, 'left')).toMatchObject({ side: 'left' })
    expect(placeBox({ top: 300, left: 100, width: 100, height: 40 }, box, screen, 'left')).toMatchObject({ side: 'right' })
  })

  it('sits over the lower right of an element that fills the screen', () => {
    expect(placeBox({ top: 0, left: 0, width: 1440, height: 900 }, box, screen)).toMatchObject({ side: 'over', top: 900 - 200 - EDGE * 2, left: 1440 - 360 - EDGE * 2 })
  })

  it('is centred when there is nothing to point at', () => {
    expect(placeBox(null, box, screen)).toEqual({ mode: 'float', side: 'center', top: 350, left: 540 })
  })

  it('never pushes a box it could not measure off the screen', () => {
    // A save button at the top right, with a box that measured 0 while it was being swapped.
    expect(placeBox({ top: 108, left: 1310, width: 114, height: 54 }, { width: 0, height: 0 }, screen)).toMatchObject({ side: 'bottom', left: 1440 - 360 - EDGE })
  })

  it('docks at the bottom on a phone', () => {
    expect(placeBox({ top: 100, left: 20, width: 100, height: 40 }, box, { width: 390, height: 844 })).toEqual({ mode: 'sheet' })
  })
})

describe('the compact box beside a dialog', () => {
  const dialog = { top: 96, left: 274, width: 892, height: 708 }
  const chip = { width: 420, height: 56 }

  it('goes to the corner that covers least of the dialog, the bottom left on a tie', () => {
    expect(cornerFor(dialog, chip, screen)).toEqual({ top: 900 - 56 - EDGE, left: EDGE })
    // A dialog reaching the bottom left: the bottom right is free.
    expect(cornerFor({ top: 300, left: 0, width: 900, height: 600 }, chip, screen)).toEqual({ top: 900 - 56 - EDGE, left: 1440 - 420 - EDGE })
    // One filling the bottom: a top corner.
    expect(cornerFor({ top: 400, left: 0, width: 1440, height: 500 }, chip, screen)).toEqual({ top: EDGE, left: EDGE })
    // A dialog and the menu rail on the left together: the bottom right, keeping the rail's Home and Sign out clear.
    expect(cornerFor([dialog, { top: 0, left: 0, width: 90, height: 900 }], chip, screen)).toEqual({ top: 900 - 56 - EDGE, left: 1440 - 420 - EDGE })
  })

  it('never covers the part the person must use, even when another corner covers more of the dialog', () => {
    const footerButton = { top: 800, left: 1200, width: 140, height: 40 }
    expect(cornerFor([{ top: 100, left: 0, width: 1440, height: 800 }], chip, screen)).toEqual({ top: EDGE, left: EDGE })
    expect(cornerFor([{ top: 0, left: 0, width: 1000, height: 900 }], chip, screen)).toEqual({ top: 900 - 56 - EDGE, left: 1440 - 420 - EDGE })
    expect(cornerFor([{ top: 0, left: 0, width: 1000, height: 900 }], chip, screen, footerButton)).toEqual({ top: EDGE, left: 1440 - 420 - EDGE })
  })

  it('knows when a floating box would cover something', () => {
    const at = boxRect({ mode: 'float', side: 'over', top: 600, left: 1000 }, { width: 360, height: 240 })!
    expect(overlapArea(at, dialog)).toBeGreaterThan(0)
    expect(overlapArea({ top: 0, left: 0, width: 10, height: 10 }, dialog)).toBe(0)
    expect(boxRect({ mode: 'sheet' }, chip)).toBeNull()
  })
})

describe('the highlight', () => {
  it('leaves a little room around the element and stays on the screen', () => {
    expect(holeRect({ top: 100, left: 200, width: 50, height: 20 }, screen)).toEqual({ top: 94, left: 194, width: 62, height: 32 })
    expect(holeRect({ top: 0, left: 0, width: 2000, height: 2000 }, screen)).toEqual({ top: 4, left: 4, width: 1432, height: 892 })
  })

  it('scrolls to an element that is mostly off the screen or under the top bar', () => {
    expect(needsScroll({ top: 300, left: 0, width: 100, height: 40 }, screen)).toBe(false)
    expect(needsScroll({ top: 1200, left: 0, width: 100, height: 40 }, screen)).toBe(true)
    expect(needsScroll({ top: 20, left: 0, width: 100, height: 40 }, screen)).toBe(true)
    expect(needsScroll({ top: 100, left: 0, width: 100, height: 3000 }, screen)).toBe(false)
  })
})
