# Map Refactoring Plan

## Goal
Refactor the map tile handling to support dynamic tile URLs per server, using the current "nitrogen" map as a fallback.

## Requirements

1.  **Backend**:
    -   Add `dynmapTileUrl` field to `MinecraftServer` entity.
    -   Allow users to configure this field via API (update DTOs).

2.  **Frontend**:
    -   Use `dynmapTileUrl` from the server configuration if available.
    -   Fallback to the default "nitrogen" map URL if `dynmapTileUrl` is not set.
    -   Update the following components to support dynamic tiles:
        -   `PlayerGameStatsPanel` (Player module)
        -   `RailwaySystemMapPanel` (Transportation module)
        -   `RailwayStationRoutesMapPanel` (Transportation module)
        -   `RailwayDepotMapPanel` (Transportation module)
        -   `RailwayMapPanel` (Transportation module)
        -   `RailwayMapFullscreenOverlay` (Transportation module)

## Todo List

### Backend
- [x] Modify `backend/prisma/schema.prisma` to add `dynmapTileUrl String?` to `MinecraftServer` model.
- [x] Run `pnpm prisma migrate dev --name add_dynmap_tile_url` to apply changes.
- [x] Update `backend/src/minecraft/dto/create-minecraft-server.dto.ts` to include `dynmapTileUrl`.
- [x] Update `backend/src/minecraft/dto/update-minecraft-server.dto.ts` to include `dynmapTileUrl`.

### Frontend
- [x] Verify `frontend/src/utils/map/config.ts` exports the fallback URL.
- [x] Update `frontend/src/views/user/Player/components/PlayerGameStatsPanel.vue`:
    - [x] Fetch `dynmapTileUrl` when server is selected.
    - [x] Pass `dynmapTileUrl` to `createHydcraftDynmapMap` or update the tile layer.
- [x] Update Transportation Map Components:
    - [x] `frontend/src/views/user/Transportation/railway/components/RailwaySystemMapPanel.vue`
    - [x] `frontend/src/views/user/Transportation/railway/components/RailwayStationRoutesMapPanel.vue`
    - [x] `frontend/src/views/user/Transportation/railway/components/RailwayDepotMapPanel.vue`
    - [x] `frontend/src/views/user/Transportation/railway/components/RailwayMapPanel.vue`
    - [x] `frontend/src/views/user/Transportation/railway/components/RailwayMapFullscreenOverlay.vue`
    - [x] Ensure these components receive the server's `dynmapTileUrl` (either via props or by fetching server details).
- [x] Update `frontend/src/views/user/Transportation/RailwayOverviewView.vue` to pass correct map configuration if needed.

## Implementation Details

-   **Fallback Logic**:
    ```typescript
    const tileUrl = server.dynmapTileUrl || FALLBACK_BASE_URL;
    ```
-   **Map Initialization**:
    ```typescript
    createHydcraftDynmapMap({ tileBaseUrl: tileUrl })
    ```
