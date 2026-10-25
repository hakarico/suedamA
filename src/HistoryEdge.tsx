/** Seeded strokes and a hollow arrowhead anchored to the canonical endpoint. */
import { memo, useMemo } from 'react'
import { getBezierPath, Position } from '@xyflow/react'
import type { Edge, EdgeProps } from '@xyflow/react'
import rough from 'roughjs'
import { historyBreak } from './history-edge-geometry.ts'
export type HistoryFlowEdge = Edge<{ agent: boolean; active: boolean; sourceColor?: string | undefined; branch?: boolean }, 'history'>
/** Draw curved history edges, with dashed Agent strokes and one hollow directed tip. */
export const HistoryEdge=memo(function HistoryEdge(props: Pick<EdgeProps<HistoryFlowEdge>,'id'|'data'|'style'|'sourceX'|'sourceY'|'targetX'|'targetY'|'sourcePosition'|'targetPosition'>) {
  const agent = !!props.data?.agent
  const active = !!props.data?.active
  const vector = props.targetPosition === Position.Left ? [1, 0] : props.targetPosition === Position.Right ? [-1, 0]
    : props.targetPosition === Position.Top ? [0, 1] : [0, -1]
  const dx = vector[0] ?? 0
  const dy = vector[1] ?? 0
  const baseX = props.targetX - dx * 18
  const baseY = props.targetY - dy * 18
  const endpoint = { ...props, targetX: baseX, targetY: baseY }
  const [path] = getBezierPath(endpoint)
  const drawing = useMemo(() => {
    const generator = rough.generator()
    const seed = Array.from(props.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 1) || 1
    const strokeWidth = active ? 4.368 : 1.8032
    const split = props.data?.branch ? historyBreak(path, seed) : null
    const stroke = (value: string, offset = 0) => generator.toPaths(generator.path(value, {
      seed: seed + offset, roughness: .55, bowing: .35, stroke: 'currentColor', strokeWidth }))
    const source = stroke(split?.upstream ?? path)
    const body = split ? stroke(split.downstream, 1) : []
    const upstreamBar = split ? stroke(split.upstreamBar, 2) : []
    const downstreamBar = split ? stroke(split.downstreamBar, 3) : []
    const head = generator.toPaths(generator.polygon([[props.targetX, props.targetY],
      [baseX - dy * 7, baseY + dx * 7], [baseX + dy * 7, baseY - dx * 7]],
    { seed: seed + 1, roughness: .35, stroke: 'currentColor', strokeWidth, disableMultiStroke: true }))
    return { source, body, head, upstreamBar, downstreamBar }
  }, [path, props.id, props.targetX, props.targetY, baseX, baseY, dx, dy, active, props.data?.branch])
  return <g style={props.style}>
    {drawing.source.map((item, index) => <path key={`source:${index}`} data-history-source d={item.d} fill="none"
      stroke={props.data?.sourceColor ?? 'var(--wl-color)'} strokeWidth={item.strokeWidth}
      strokeDasharray={agent ? '9 7' : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
    {drawing.body.map((item, index) => <path key={index} d={item.d} fill="none" stroke="var(--wl-color)"
      strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={agent ? '9 7' : undefined} />)}
    {drawing.upstreamBar.map((item, index) => <path key={`break-up:${index}`} data-history-break="upstream" d={item.d}
      fill="none" stroke={props.data?.sourceColor ?? 'var(--wl-color)'} strokeWidth={item.strokeWidth}
      strokeDasharray="none" strokeLinecap="round" />)}
    {drawing.downstreamBar.map((item, index) => <path key={`break-down:${index}`} data-history-break="downstream" d={item.d}
      fill="none" stroke="var(--wl-color)" strokeWidth={item.strokeWidth} strokeDasharray="none" strokeLinecap="round" />)}
    {drawing.head.map((item, index) => <path key={`head:${index}`} data-history-arrow d={item.d}
      fill="none" stroke="var(--wl-color)" strokeDasharray="none" strokeWidth={item.strokeWidth} strokeLinejoin="round" />)}
  </g>
})
