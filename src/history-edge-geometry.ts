/** Arc-length split of the M/L/Q/C paths produced by React Flow. */
type Point = readonly [number, number]
type Segment = Point[]
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function divide(segment: Segment, t: number): [Segment, Segment] {
  const left: Segment = [segment[0]!], right: Segment = [segment.at(-1)!]
  let row = segment
  while (row.length > 1) {
    row = row.slice(1).map((point, index) => mix(row[index]!, point, t))
    left.push(row[0]!); right.unshift(row.at(-1)!)
  }
  return [left, right]
}
const pointAt = (segment: Segment, t: number): Point => divide(segment, t)[0].at(-1)!
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])
function serialize(segments: Segment[]): string {
  if (!segments.length) return ''
  const first = segments[0]![0]!
  return `M${first[0]},${first[1]} ` + segments.map(segment =>
    `${segment.length === 4 ? 'C' : segment.length === 3 ? 'Q' : 'L'}${segment.slice(1).map(point => point.join(',')).join(' ')}`).join(' ')
}
/** Keep an actual blank gap around 30% of path length, with parallel, seeded ±60° end bars. */
export function historyBreak(path: string, seed: number) {
  const segments: Segment[] = []
  let current: Point = [0, 0]
  for (const command of path.match(/[MLQC][^MLQC]*/g) ?? []) {
    const numbers = (command.slice(1).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number)
    const points: Point[] = []
    for (let index = 0; index < numbers.length; index += 2) points.push([numbers[index]!, numbers[index + 1]!])
    if (command[0] !== 'M' && points.length) segments.push([current, ...points])
    if (points.length) current = points.at(-1)!
  }
  const samples: { index: number; t: number; length: number }[] = []
  let total = 0
  segments.forEach((segment, index) => {
    let prior = segment[0]!
    samples.push({ index, t: 0, length: total })
    const steps = segment.length === 2 ? 1 : 80
    for (let step = 1; step <= steps; step++) {
      const t = step / steps, point = pointAt(segment, t)
      total += distance(prior, point); samples.push({ index, t, length: total }); prior = point
    }
  })
  if (total < 2) return null
  const locate = (length: number) => {
    const end = samples.findIndex(sample => sample.length >= length)
    const after = samples[Math.max(0, end)]!, before = samples[Math.max(0, end - 1)]!
    const t = after.index === before.index ? before.t + (after.t - before.t)
      * (length - before.length) / (after.length - before.length || 1) : after.t
    return { index: after.index, t }
  }
  const gap = Math.min(16, total * .12), center = total * .3
  const start = locate(center - gap / 2), end = locate(center + gap / 2), mid = locate(center)
  const [prefix] = divide(segments[start.index]!, start.t)
  const [, suffix] = divide(segments[end.index]!, end.t)
  const a = prefix.at(-1)!, b = suffix[0]!
  const midSegment = segments[mid.index]!
  const tangentStart = pointAt(midSegment, Math.max(0, mid.t - .001))
  const tangentEnd = pointAt(midSegment, Math.min(1, mid.t + .001))
  const angle = Math.atan2(tangentEnd[1] - tangentStart[1], tangentEnd[0] - tangentStart[0])
    + Math.PI / 2 + ((seed % 121) - 60) * Math.PI / 180
  const width = Math.min(32, Math.max(12, total * .12))
  const dx = Math.cos(angle) * width / 2, dy = Math.sin(angle) * width / 2
  const bar = (point: Point) => `M${point[0] - dx},${point[1] - dy} L${point[0] + dx},${point[1] + dy}`
  return { upstream: serialize([...segments.slice(0, start.index), prefix]),
    downstream: serialize([suffix, ...segments.slice(end.index + 1)]),
    upstreamBar: bar(a), downstreamBar: bar(b) }
}
