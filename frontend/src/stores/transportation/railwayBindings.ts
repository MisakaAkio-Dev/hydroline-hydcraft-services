import { defineStore } from 'pinia'
import { apiFetch } from '@/utils/http/api'
import { useAuthStore } from '@/stores/user/auth'
import type {
  RailwayCompanyBindingEntry,
  RailwayCompanyBindingPayload,
  RailwayCompanyBindingStatItem,
} from '@/types/transportation'

export type RailwayBindingScope = {
  entityType: string
  entityId: string
  serverId?: string | null
  railwayType?: string | null
  dimension?: string | null
}

export const useTransportationRailwayBindingsStore = defineStore(
  'transportation-railway-bindings',
  {
    actions: {
      async fetchBindings(scope: RailwayBindingScope) {
        const query = new URLSearchParams({
          entityType: scope.entityType,
          entityId: scope.entityId,
        })
        if (scope.serverId) query.set('serverId', scope.serverId)
        if (scope.railwayType) query.set('railwayType', scope.railwayType)
        if (scope.dimension) query.set('dimension', scope.dimension)

        return apiFetch<RailwayCompanyBindingPayload>(
          `/transportation/railway/bindings?${query.toString()}`,
        )
      },
      async updateBindings(
        scope: RailwayBindingScope,
        payload: RailwayCompanyBindingPayload,
      ) {
        const authStore = useAuthStore()
        return apiFetch<RailwayCompanyBindingPayload>(
          '/transportation/railway/bindings',
          {
            method: 'PATCH',
            token: authStore.token,
            body: {
              entityType: scope.entityType,
              entityId: scope.entityId,
              serverId: scope.serverId ?? null,
              railwayType: scope.railwayType ?? null,
              dimension: scope.dimension ?? null,
              operatorCompanyIds: payload.operatorCompanyIds,
              builderCompanyIds: payload.builderCompanyIds,
            },
          },
        )
      },
      async fetchCompanyStats(bindingType: string, entityType?: string) {
        const query = new URLSearchParams({
          bindingType,
        })
        if (entityType) query.set('entityType', entityType)
        return apiFetch<RailwayCompanyBindingStatItem[]>(
          `/transportation/railway/companies/statistics?${query.toString()}`,
        )
      },
      async fetchCompanyBindings(companyId: string, bindingType?: string) {
        const query = new URLSearchParams()
        if (bindingType) query.set('bindingType', bindingType)
        return apiFetch<RailwayCompanyBindingEntry[]>(
          `/transportation/railway/companies/${companyId}/bindings?${query.toString()}`,
        )
      },
    },
  },
)
