import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresRole?: string | string[]
    requiresPermissions?: string | string[]
    layout?: 'user' | 'admin'
  }
}
