import { describe, it, expect } from 'vitest'
import { planSlices, planDraws } from '../src/lib/stitch-plan.js'

/**
 * The property that matters: every row of the finished image is painted exactly
 * once. A gap is a white band; a double is a repeated band across the seam.
 */
function coverage(total, viewport, scale = 1) {
  const offsets = planSlices(total, viewport)
  const canvasHeight = Math.round(total * scale)
  const sliceHeight = Math.round(viewport * scale)
  const rows = new Array(canvasHeight).fill(0)

  for (const draw of planDraws(offsets, sliceHeight, canvasHeight, scale)) {
    for (let y = draw.destY; y < draw.destY + draw.height; y++) rows[y]++
  }

  return {
    canvasHeight,
    gaps: rows.filter((n) => n === 0).length,
    doubled: rows.filter((n) => n > 1).length,
    slices: offsets.length,
  }
}

describe('planSlices', () => {
  it('needs one capture when the document already fits', () => {
    expect(planSlices(800, 800)).toEqual([0])
  })

  it('steps a whole viewport at a time when it divides evenly', () => {
    expect(planSlices(1600, 800)).toEqual([0, 800])
  })

  it('clamps the last scroll to the end of the document', () => {
    // 900 tall, 688 visible: the second scroll can only reach 212.
    expect(planSlices(900, 688)).toEqual([0, 212])
  })

  it('never scrolls past the end, however ragged the fit', () => {
    for (const offset of planSlices(2401, 800)) expect(offset).toBeLessThanOrEqual(2401 - 800)
  })

  it('survives nonsense rather than looping forever', () => {
    expect(planSlices(0, 0)).toEqual([0])
    expect(planSlices(100, 0)).toEqual([0])
  })
})

describe('planDraws', () => {
  it('paints a single slice whole', () => {
    expect(planDraws([0], 800, 800)).toEqual([{ index: 0, sourceY: 0, destY: 0, height: 800 }])
  })

  it('skips the overlapped part of a clamped last slice', () => {
    // Second slice sits at 212 but 688 rows are already painted, so it
    // contributes only its bottom 212 rows.
    const draws = planDraws(planSlices(900, 688), 688, 900)
    expect(draws).toEqual([
      { index: 0, sourceY: 0, destY: 0, height: 688 },
      { index: 1, sourceY: 476, destY: 688, height: 212 },
    ])
  })

  it('drops a slice that would add nothing', () => {
    // Same offset twice: the second is entirely covered already.
    expect(planDraws([0, 0], 800, 800)).toHaveLength(1)
  })

  it('honours a device pixel ratio above one', () => {
    const draws = planDraws(planSlices(900, 688), 1376, 1800, 2)
    expect(draws[0]).toEqual({ index: 0, sourceY: 0, destY: 0, height: 1376 })
    expect(draws[1].destY).toBe(1376)
    expect(draws[1].destY + draws[1].height).toBe(1800)
  })
})

describe('coverage', () => {
  const cases = [
    ['exactly one viewport', 800, 800],
    ['an exact multiple', 1600, 800],
    ['a ragged last slice', 1700, 800],
    ['three ragged steps', 2401, 800],
    ['a long document', 12000, 688],
    ['just over one viewport', 900, 688],
    ['an odd height', 1001, 333],
  ]

  for (const [label, total, viewport] of cases) {
    it(`covers ${label} exactly once`, () => {
      const result = coverage(total, viewport)
      expect(result.gaps).toBe(0)
      expect(result.doubled).toBe(0)
    })
  }

  it('covers exactly once at 2x as well', () => {
    const result = coverage(1700, 688, 2)
    expect(result.gaps).toBe(0)
    expect(result.doubled).toBe(0)
  })
})
