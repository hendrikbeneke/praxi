import { z } from 'zod'

/**
 * The body of every catalogue's `POST .../:id/move` — one step up or down,
 * never an arbitrary position. Shared because the route is the same shape on
 * every catalogue with a `sort_order` column; see `domain/reorder.ts`.
 */
export const moveInputSchema = z.object({
  delta: z.union([z.literal(1), z.literal(-1)]),
})

export type MoveInput = z.infer<typeof moveInputSchema>
