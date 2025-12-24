import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  type DynmapMapInitOptions,
} from '@/utils/map'
import type { RailwayGeometryPoint } from '@/types/transportation'

const DEFAULT_COLOR = '#0ea5e9'

export type SystemRoutePath = {
  id: string
  color?: number | null
  paths: RailwayGeometryPoint[][]
  label?: string | null
}

export type SystemStop = {
  id: string | null
  name: string
  position: RailwayGeometryPoint
  isTransfer: boolean
}

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return DEFAULT_COLOR
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwaySystemMap {
  private controller: DynmapMapController
  private polylines: L.Polyline[] = []
  private stopLayer: L.LayerGroup | null = null

  constructor() {
    this.controller = createHydcraftDynmapMap()
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
  }

  destroy() {
    this.clearRoutes()
    const map = this.controller.getLeafletInstance()
    if (map) {
      map.remove()
    }
  }

  drawRoutes(routes: SystemRoutePath[], stops: SystemStop[], autoFocus = true) {
    this.clearRoutes()
    const map = this.controller.getLeafletInstance()
    if (!map || !(map as any)._loaded) {
      map?.whenReady(() => this.drawRoutes(routes, stops, autoFocus))
      return
    }

    let bounds: L.LatLngBounds | null = null

    routes.forEach((route) => {
      const color = toHexColor(route.color ?? null)
      route.paths.forEach((path) => {
        if (!path.length) return
        const latlngs = path
          .map((point) => this.controller.toLatLng({ x: point.x, z: point.z }))
          .filter((entry): entry is L.LatLng => Boolean(entry))
        const polyline = L.polyline(latlngs, {
          color,
          weight: 4,
          opacity: 0.85,
          className: 'railway-system-route-polyline',
        }).addTo(map)
        this.polylines.push(polyline)
        const polyBounds = polyline.getBounds()
        bounds = bounds ? bounds.extend(polyBounds) : polyBounds
      })
    })

    if (autoFocus && bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32] })
    }

    this.renderStops(map, stops)
  }

  private renderStops(map: L.Map, stops: SystemStop[]) {
    if (this.stopLayer) {
      map.removeLayer(this.stopLayer)
    }
    const layer = L.layerGroup()
    stops.forEach((stop) => {
      const latlng = this.controller.toLatLng({
        x: stop.position.x,
        z: stop.position.z,
      })
      if (!latlng) return
      const marker = L.circleMarker(latlng, {
        radius: stop.isTransfer ? 6 : 4,
        color: stop.isTransfer ? '#0f172a' : '#475569',
        weight: 1.5,
        fillColor: stop.isTransfer ? '#f97316' : '#e2e8f0',
        fillOpacity: 0.9,
        className: stop.isTransfer
          ? 'railway-system-transfer-marker'
          : 'railway-system-stop-marker',
      })
      marker.bindTooltip(stop.name, {
        permanent: false,
        sticky: true,
        direction: 'top',
        offset: L.point(0, -6),
        className: 'railway-system-stop-label',
      })
      marker.addTo(layer)
    })
    layer.addTo(map)
    this.stopLayer = layer
  }

  private clearRoutes() {
    const map = this.controller.getLeafletInstance()
    if (!map) return
    this.polylines.forEach((polyline) => polyline.remove())
    this.polylines = []
    if (this.stopLayer) {
      map.removeLayer(this.stopLayer)
      this.stopLayer = null
    }
  }
}
