import type { Service, ServiceGroup, ServiceGroupInput, ServiceInput } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export const serviceListQueryOptions = (includeInactive: boolean) =>
  queryOptions({
    queryKey: ['services', 'list', { includeInactive }],
    queryFn: async (): Promise<Service[]> => {
      const res = await api.api.services.$get({
        query: { includeInactive: includeInactive ? 'true' : 'false' },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export const serviceGroupListQueryOptions = (includeInactive: boolean) =>
  queryOptions({
    queryKey: ['service-groups', 'list', { includeInactive }],
    queryFn: async (): Promise<ServiceGroup[]> => {
      const res = await api.api['service-groups'].$get({
        query: { includeInactive: includeInactive ? 'true' : 'false' },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createService(input: ServiceInput): Promise<Service> {
  const res = await api.api.services.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateService(serviceId: string, input: ServiceInput): Promise<Service> {
  const res = await api.api.services[':serviceId'].$put({ param: { serviceId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function createServiceGroup(input: ServiceGroupInput): Promise<ServiceGroup> {
  const res = await api.api['service-groups'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateServiceGroup(
  groupId: string,
  input: ServiceGroupInput,
): Promise<ServiceGroup> {
  const res = await api.api['service-groups'][':groupId'].$put({
    param: { groupId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteService(serviceId: string): Promise<void> {
  const res = await api.api.services[':serviceId'].$delete({ param: { serviceId } })
  if (!res.ok) throw await apiError(res)
}

export async function deleteServiceGroup(groupId: string): Promise<void> {
  const res = await api.api['service-groups'][':groupId'].$delete({ param: { groupId } })
  if (!res.ok) throw await apiError(res)
}

/** One step up (`-1`) or down (`1`) — see `domain/reorder.ts`. */
export async function moveService(serviceId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api.services[':serviceId'].move.$post({
    param: { serviceId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}

/** One step up (`-1`) or down (`1`) — see `domain/reorder.ts`. */
export async function moveServiceGroup(groupId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api['service-groups'][':groupId'].move.$post({
    param: { groupId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}
