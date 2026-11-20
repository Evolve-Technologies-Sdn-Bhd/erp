import { describe, expect, it } from 'vitest'
import { EDGE, GAP, holeRect, needsScroll, placeBox } from './placement.rules'

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

  it('docks at the bottom on a phone', () => {
    expect(placeBox({ top: 100, left: 20, width: 100, height: 40 }, box, { width: 390, height: 844 })).toEqual({ mode: 'sheet' })
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
