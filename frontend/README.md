# @hydroline/frontend

> The interactive web portal for Hydroline HydCraft Services, providing players and admins with a rich visual interface to the server ecosystem.

This project is the user-facing component of the platform, delivering a modern, responsive dashboard for everything from map viewing to account management. It connects directly to the backend API to provide real-time data and interactive features.

## Functional Overview

The frontend provides a unified dashboard for all server services. Users can access a **GIS-based Map System** to view server terrain and transportation networks. The **Profile Management** section allows users to view their player stats and render 3D skins.

For gameplay features, it includes interfaces for **Company Management**, allowing players to manage organizations, and a **Transportation Viewer** for railway networks. Administrative tools are also embedded for managing server configurations and user permissions.

## Technology Stack

The application is a Single Page Application (SPA) built with **Vue 3** and **Vite**.

- **Core Framework**: Vue 3 (Composition API) + TypeScript.
- **UI & Styling**: **Tailwind CSS** for utility-first styling, complemented by **Nuxt UI** and **Headless UI** for accessible components. **Motion V** handles animations.
- **Visualization**: **Leaflet** is used for map rendering, **ECharts** for data visualization, and **skinview3d** for rendering Minecraft player models.
- **State Management**: **Pinia** for centralized store management.
- **Editor**: **Monaco Editor** integration for advanced text/code editing capabilities within the UI.

## Development

To start the development server:

```bash
pnpm dev
```

The application will typically run on port `5173` and proxy API requests to the backend service.
