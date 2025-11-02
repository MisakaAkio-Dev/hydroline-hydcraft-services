import { defineStore } from 'pinia'
import { apiFetch, ApiError } from '@/utils/api'

const ACCESS_TOKEN_KEY = 'hydroline.accessToken'

type RawUser = Record<string, any>

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: (typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null) as string | null,
    user: null as RawUser | null,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    roleKeys(state): string[] {
      if (!state.user?.roles) return []
      return state.user.roles.map((entry: any) => entry.role?.key).filter(Boolean)
    },
    permissionKeys(state): string[] {
      if (!state.user?.roles) return []
      const keys = new Set<string>()
      for (const entry of state.user.roles as any[]) {
        const perms = entry.role?.rolePermissions ?? []
        for (const rp of perms) {
          if (rp.permission?.key) {
            keys.add(rp.permission.key)
          }
        }
      }
      return Array.from(keys)
    },
    hasRole() {
      return (roleKey: string) => this.roleKeys.includes(roleKey)
    },
    hasPermission() {
      return (permissionKey: string) => this.permissionKeys.includes(permissionKey)
    },
    displayName(state): string | null {
      if (!state.user) return null
      return (
        state.user.profile?.displayName ??
        state.user.name ??
        state.user.email ??
        null
      )
    },
  },
  actions: {
    setToken(token: string | null) {
      this.token = token
      if (typeof window !== 'undefined') {
        if (token) {
          localStorage.setItem(ACCESS_TOKEN_KEY, token)
        } else {
          localStorage.removeItem(ACCESS_TOKEN_KEY)
        }
      }
    },
    async initialize() {
      if (this.initialized) return
      this.initialized = true
      if (!this.token) {
        return
      }
      try {
        await this.fetchSession()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.clear()
        } else {
          throw error
        }
      }
    },
    async signIn(payload: { email: string; password: string; rememberMe?: boolean }) {
      this.loading = true
      try {
        const result = await apiFetch<{ tokens: { accessToken: string }; user: RawUser }>(
          '/auth/signin',
          {
            method: 'POST',
            body: {
              email: payload.email,
              password: payload.password,
              rememberMe: payload.rememberMe ?? false,
            },
          },
        )
        this.setToken(result.tokens.accessToken)
        this.user = result.user
        return result.user
      } finally {
        this.loading = false
      }
    },
    async signOut() {
      if (!this.token) {
        this.clear()
        return
      }
      try {
        await apiFetch('/auth/signout', {
          method: 'POST',
          token: this.token,
        })
      } catch (error) {
        // 忽略 401
      } finally {
        this.clear()
        const { usePortalStore } = await import('./portal')
        usePortalStore().reset()
      }
    },
    async fetchSession() {
      if (!this.token) {
        return null
      }
      const result = await apiFetch<{ user: RawUser }>('/auth/session', {
        token: this.token,
      })
      this.user = result.user
      return result.user
    },
    clear() {
      this.setToken(null)
      this.user = null
      this.initialized = false
    },
  },
})
