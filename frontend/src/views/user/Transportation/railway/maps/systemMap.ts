import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  createHydcraftDynmapMap,
  DynmapMapController,
  type DynmapMapInitOptions,
} from '@/utils/map'
import type { RailwayGeometryPoint } from '@/types/transportation'

const DEFAULT_COLOR = '#0ea5e9'

const LABEL_POSITIONS: Array<{
  direction: L.Direction
  offset: L.PointExpression
}> = [
  { direction: 'top', offset: L.point(0, -14) },
  { direction: 'right', offset: L.point(14, 0) },
  { direction: 'bottom', offset: L.point(0, 14) },
  { direction: 'left', offset: L.point(-14, 0) },
]

const PLATFORM_LABEL_POSITIONS: Array<{
  direction: L.Direction
  offset: L.PointExpression
}> = [
  { direction: 'top', offset: L.point(0, -8) },
  { direction: 'right', offset: L.point(8, 0) },
  { direction: 'bottom', offset: L.point(0, 8) },
  { direction: 'left', offset: L.point(-8, 0) },
]

function pickLabelPosition(index: number, isPlatform = false) {
  const positions = isPlatform ? PLATFORM_LABEL_POSITIONS : LABEL_POSITIONS
  return positions[index % positions.length]
}

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
  color?: number | null
}

export type SystemPlatform = {
  id: string
  name: string
  position: RailwayGeometryPoint
  color?: number | null
}

function bindRouteHoverLabel(polyline: L.Polyline, label: string) {
  const text = label.trim()
  if (!text) return
  polyline.bindTooltip(text, {
    permanent: false,
    sticky: true,
    direction: 'top',
    offset: L.point(0, -8),
    className: 'railway-route-hover-label',
  })
}

function toHexColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return DEFAULT_COLOR
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`
}

export class RailwaySystemMap {
  private controller: DynmapMapController
  private polylines: L.Polyline[] = []
  private stopLayer: L.LayerGroup | null = null
  private zoomHandler: (() => void) | null = null
  private stops: SystemStop[] = []
  private platforms: SystemPlatform[] = []

  constructor(options?: { tileBaseUrl?: string | null }) {
    this.controller = createHydcraftDynmapMap(options)
  }

  mount(options: DynmapMapInitOptions) {
    this.controller.mount(options)
    const map = this.controller.getLeafletInstance()
    if (map) {
      this.zoomHandler = () => {
        this.renderStops(map)
      }
      map.on('zoomend', this.zoomHandler)
    }
  }

  getController() {
    return this.controller
  }

  destroy() {
    this.clearRoutes()
    const map = this.controller.getLeafletInstance()
    if (map) {
      if (this.zoomHandler) {
        map.off('zoomend', this.zoomHandler)
        this.zoomHandler = null
      }
      map.remove()
    }
  }

  drawRoutes(
    routes: SystemRoutePath[],
    stops: SystemStop[],
    platforms: SystemPlatform[],
    autoFocus = true,
  ) {
    this.stops = stops
    this.platforms = platforms
    this.clearRoutes()
    const map = this.controller.getLeafletInstance()
    if (!map || !(map as any)._loaded) {
      map?.whenReady(() => this.drawRoutes(routes, stops, platforms, autoFocus))
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
        }).addTo(map)

        if (route.label) {
          bindRouteHoverLabel(polyline, route.label)
        }

        this.polylines.push(polyline)
        const polyBounds = polyline.getBounds()
        bounds = bounds ? bounds.extend(polyBounds) : polyBounds
      })
    })

    if (autoFocus && bounds?.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32] })
    }

    this.renderStops(map)
  }

  private renderStops(map: L.Map) {
    if (this.stopLayer) {
      map.removeLayer(this.stopLayer)
    }
    const layer = L.layerGroup()
    const zoom = map.getZoom()
    // Follow StationDetail behavior: zoomed-out shows station stops; zoomed-in shows platforms.
    // Dynmap/Leaflet zoom range is limited; use level 3 as the switch point.
    const showPlatforms = zoom >= 3

    if (showPlatforms) {
      this.renderPlatformsLayer(layer, this.platforms)
    } else {
      this.renderStationsLayer(layer, this.stops)
    }

    layer.addTo(map)
    this.stopLayer = layer
  }

  private renderStationsLayer(layer: L.LayerGroup, stops: SystemStop[]) {
    stops.forEach((stop, index) => {
      const latlng = this.controller.toLatLng({
        x: stop.position.x,
        z: stop.position.z,
      })
      if (!latlng) return

      const isTransfer = stop.isTransfer
      const routeColor = toHexColor(stop.color)
      const primaryColor = '#0ea5e9'

      // Style Logic:
      // Transfer: Fill = Primary, Border = White
      // Normal: Fill = White, Border = Route Color
      const fillColor = isTransfer ? primaryColor : '#ffffff'
      const borderColor = isTransfer ? '#ffffff' : routeColor

      const size = 18
      const radius = size / 2
      const borderWidth = 4

      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'bg-transparent',
          html: `
            <div class="rounded-full"
                 style="width: ${size}px; height: ${size}px; background-color: ${fillColor}; border: ${borderWidth}px solid ${borderColor}; box-sizing: border-box; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            </div>
          `,
          iconSize: [size, size],
          iconAnchor: [radius, radius],
        }),
      })

      const labelPos = pickLabelPosition(index)
      marker.bindTooltip(stop.name, {
        permanent: true,
        // Prevent labels from being clipped by the map container (overflow-hidden)
        // when zoomed out and markers are near the viewport edge.
        direction: labelPos.direction,
        offset: labelPos.offset,
        className: 'railway-station-label',
      })

      marker.addTo(layer)
    })
  }

  private renderPlatformsLayer(
    layer: L.LayerGroup,
    platforms: SystemPlatform[],
  ) {
    platforms.forEach((platform, index) => {
      const latlng = this.controller.toLatLng({
        x: platform.position.x,
        z: platform.position.z,
      })
      if (!latlng) return

      const marker = L.circleMarker(latlng, {
        radius: 3,
        stroke: false,
        fill: true,
        fillColor: '#ffffff',
        fillOpacity: 0.95,
      })

      const labelPos = pickLabelPosition(index, true)
      marker.bindTooltip(platform.name, {
        permanent: true,
        direction: labelPos.direction,
        offset: labelPos.offset,
        className: 'railway-station-label-small',
      })

      marker.addTo(layer)
    })
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
