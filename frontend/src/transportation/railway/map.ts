import L from 'leaflet'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  type DynmapMapInitOptions,
} from '@/utils/map'
import type { RailwayGeometryPoint } from '@/types/transportation'

type DrawOptions = {
  color?: number | null
  weight?: number
  opacity?: number
  focusZoom?: number
}

const defaultColor = '#0ea5e9'

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return defaultColor
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwayMap {
  private controller: DynmapMapController
  private polyline: L.Polyline | null = null

  constructor() {
    this.controller = createHydcraftDynmapMap()
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
  }

  getController() {
    return this.controller
  }

  drawGeometry(points: RailwayGeometryPoint[], options?: DrawOptions) {
    this.polyline?.remove()
    this.polyline = null
    if (!points?.length) return
    const latlngs = points
      .map((point) =>
        this.controller.toLatLng({
          x: point.x,
          z: point.z,
        }),
      )
      .filter(Boolean) as L.LatLngExpression[]
    if (!latlngs.length) return
    const map = this.controller.getLeafletInstance()
    if (!map) return
    this.polyline = L.polyline(latlngs, {
      color: toHexColor(options?.color ?? null),
      weight: options?.weight ?? 4,
      opacity: options?.opacity ?? 0.85,
    }).addTo(map)
    const focusZoom = options?.focusZoom ?? 4
    this.controller.flyToBlock(points[0], focusZoom)
  }

  destroy() {
    this.polyline?.remove()
    this.polyline = null
    this.controller.destroy()
  }
}
