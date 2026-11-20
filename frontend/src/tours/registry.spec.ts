import { describe, expect, it } from 'vitest'
import { TOURS } from './registry'
import { tourProblems } from './tour.rules'

/**
 * Checks every shipped tour against the screens: each element a tour points at exists in some .vue file, either as
 * data-tour="id" or under a dynamic id such as :data-tour="`rail:${g.key}`" (counted by its prefix).
 */
const sources = import.meta.glob('/src/**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const fixed = new Set<string>()
const prefixes = new Set<string>()
for (const text of Object.values(sources)) {
  for (const m of text.matchAll(/\sdata-tour="([^"]+)"/g)) fixed.add(m[1]!)
  for (const m of text.matchAll(/:data-tour="`([^`$]*)\$\{/g)) prefixes.add(m[1]!)
}
const exists = (id: string) => fixed.has(id) || [...prefixes].some((p) => p && id.startsWith(p))

describe('shipped tours', () => {
  it('found the screens to check against', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(fixed.size).toBeGreaterThan(10)
  })

  it('have unique ids', () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(TOURS.map((t) => [t.id, t] as const))('%s is well formed and never waits for a sensitive action', (_id, tour) => {
    expect(tourProblems(tour)).toEqual([])
  })

  it.each(TOURS.map((t) => [t.id, t] as const))('%s points only at elements the screens have', (_id, tour) => {
    const missing = tour.steps.filter((s) => s.target && !exists(s.target)).map((s) => s.target)
    expect(missing).toEqual([])
  })
})
