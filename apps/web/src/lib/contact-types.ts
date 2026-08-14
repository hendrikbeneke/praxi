import type {
  ContactRelation,
  ContactRelationInput,
  ContactRelationType,
  ContactRelationTypeCreate,
  ContactRelationTypeInput,
  ContactRoleType,
  ContactRoleTypeCreate,
  ContactRoleTypeInput,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * The two catalogues from CLAUDE.md rule 4 and the relations of one contact.
 *
 * The label of a relation is not fetched with the relation: the client has the
 * catalogue loaded anyway, and resolving it here — through `relationLabel()`
 * from `packages/shared` — keeps one implementation for both ends and for the
 * settings screen.
 */

export const roleTypeListQueryOptions = (includeInactive = false) =>
  queryOptions({
    queryKey: ['contact-role-types', { includeInactive }],
    queryFn: async (): Promise<ContactRoleType[]> => {
      const res = await api.api['contact-role-types'].$get({
        query: { includeInactive: includeInactive ? 'true' : 'false' },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createRoleType(input: ContactRoleTypeCreate): Promise<ContactRoleType> {
  const res = await api.api['contact-role-types'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateRoleType(
  typeId: string,
  input: ContactRoleTypeInput,
): Promise<ContactRoleType> {
  const res = await api.api['contact-role-types'][':typeId'].$put({
    param: { typeId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteRoleType(typeId: string): Promise<void> {
  const res = await api.api['contact-role-types'][':typeId'].$delete({ param: { typeId } })
  if (!res.ok) throw await apiError(res)
}

/** One step up (`-1`) or down (`1`) — see `domain/reorder.ts`. */
export async function moveRoleType(typeId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api['contact-role-types'][':typeId'].move.$post({
    param: { typeId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}

export const relationTypeListQueryOptions = (includeInactive = false) =>
  queryOptions({
    queryKey: ['contact-relation-types', { includeInactive }],
    queryFn: async (): Promise<ContactRelationType[]> => {
      const res = await api.api['contact-relation-types'].$get({
        query: { includeInactive: includeInactive ? 'true' : 'false' },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createRelationType(
  input: ContactRelationTypeCreate,
): Promise<ContactRelationType> {
  const res = await api.api['contact-relation-types'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateRelationType(
  typeId: string,
  input: ContactRelationTypeInput,
): Promise<ContactRelationType> {
  const res = await api.api['contact-relation-types'][':typeId'].$put({
    param: { typeId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteRelationType(typeId: string): Promise<void> {
  const res = await api.api['contact-relation-types'][':typeId'].$delete({ param: { typeId } })
  if (!res.ok) throw await apiError(res)
}

/** One step up (`-1`) or down (`1`) — see `domain/reorder.ts`. */
export async function moveRelationType(typeId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api['contact-relation-types'][':typeId'].move.$post({
    param: { typeId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}

export const relationListQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['contacts', 'relations', contactId],
    queryFn: async (): Promise<ContactRelation[]> => {
      const res = await api.api.contacts[':contactId'].relations.$get({ param: { contactId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function addRelation(
  contactId: string,
  input: ContactRelationInput,
): Promise<ContactRelation> {
  const res = await api.api.contacts[':contactId'].relations.$post({
    param: { contactId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function removeRelation(contactId: string, relationId: string): Promise<void> {
  const res = await api.api.contacts[':contactId'].relations[':relationId'].$delete({
    param: { contactId, relationId },
  })
  if (!res.ok) throw await apiError(res)
}
