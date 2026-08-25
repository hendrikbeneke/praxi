import type {
  ContactRelationType,
  ContactRelationTypeCreate,
  ContactRoleType,
  ContactRoleTypeInput,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import {
  ActiveStatus,
  CheckboxField,
  DeleteButton,
  DetailField,
  OrderButtons,
} from '@/components/catalogue-controls'
import { InlineDetailRow, useInlineDetail } from '@/components/inline-detail-row'
import { DASH, ListCard, ListCardTitleBar } from '@/components/list-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import {
  createRelationType,
  createRoleType,
  deleteRelationType,
  deleteRoleType,
  moveRelationType,
  moveRoleType,
  relationTypeListQueryOptions,
  roleTypeListQueryOptions,
  updateRelationType,
  updateRoleType,
} from '@/lib/contact-types'
import { strings } from '@/lib/strings'

/**
 * The two catalogues behind CLAUDE.md rule 4, one settings section each
 * (D4: "Rollen", "Beziehungen") — no longer a `Tabs` pair under one combined
 * heading. Each list opens its detail inline underneath the row rather than
 * in a dialog (design handoff, "Durchgehende Muster" 2); a brand-new entry
 * gets the same form, shown above the list instead of under a row that does
 * not exist yet. Reordering goes through the single `/move` call from D2,
 * not two separate `PUT`s swapping `sortOrder`.
 */

function useCatalogue(key: string) {
  const queryClient = useQueryClient()
  return {
    invalidate: () => queryClient.invalidateQueries({ queryKey: [key] }),
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : strings.contactType.saveFailed),
  }
}

// ---------------------------------------------------------------- role types

export function RoleTypeSettings() {
  const { invalidate, onError } = useCatalogue('contact-role-types')
  const types = useQuery(roleTypeListQueryOptions)
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ContactRoleTypeInput }) =>
      input.id
        ? updateRoleType(input.id, input.values)
        : createRoleType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoleType(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveRoleType(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = types.data ?? []

  return (
    <>
      <ListCard>
        <ListCardTitleBar
          title={strings.contactType.tabRoles}
          hint={strings.contactType.rolesHint}
          action={
            <Button
              size="sm"
              onClick={() => {
                detail.close()
                setCreating((current) => !current)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {strings.contactType.createRole}
            </Button>
          }
        />

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <RoleTypeForm
              pending={save.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={(values) => save.mutate({ values })}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {types.isPending ? strings.status.loading : strings.contactType.emptyRoles}
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((type, index) => (
                <Fragment key={type.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      setCreating(false)
                      detail.toggle(type.id)
                    }}
                  >
                    <TableCell>
                      <span className="font-medium">{type.label}</span>
                      {type.showAsTab && (
                        <Badge variant="outline" className="ml-2">
                          {strings.contactType.showAsTab}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <OrderButtons
                        index={index}
                        count={rows.length}
                        pending={move.isPending}
                        onMove={(i, delta) => {
                          const row = rows[i]
                          if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                        }}
                      />
                    </TableCell>
                  </TableRow>

                  {detail.isOpen(type.id) && (
                    <InlineDetailRow colSpan={2}>
                      {detail.editing ? (
                        <RoleTypeForm
                          type={type}
                          pending={save.isPending}
                          onCancel={detail.stopEditing}
                          onSubmit={(values) => save.mutate({ id: type.id, values })}
                        />
                      ) : (
                        <div className="space-y-4">
                          <dl className="flex flex-wrap gap-8">
                            <DetailField
                              label={strings.contactType.showAsTab}
                              value={type.showAsTab ? strings.contactType.flagYes : DASH}
                            />
                          </dl>
                          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                            <Button size="sm" variant="outline" onClick={detail.startEditing}>
                              {strings.actions.edit}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={detail.close}>
                              {strings.actions.close}
                            </Button>
                            {/* Never disabled: there is no system entry left to
                                protect. A role a contact still holds is refused
                                by the server, with the number in the message. */}
                            <DeleteButton
                              disabled={false}
                              onConfirm={() => remove.mutate(type.id)}
                              title={strings.contactType.deleteTitle}
                              body={strings.contactType.deleteBody}
                            />
                          </div>
                        </div>
                      )}
                    </InlineDetailRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
      {/* The sentence the design puts under the card — it answers the question
          the list itself raises, so it belongs below it, not in the title bar (K3). */}
      <p className="mt-3 text-muted-foreground text-sm">{strings.contactType.rolesFooter}</p>
    </>
  )
}

function toRoleValues(type: ContactRoleType): ContactRoleTypeInput {
  return {
    label: type.label,
    showAsTab: type.showAsTab,
    sortOrder: type.sortOrder,
  }
}

function RoleTypeForm({
  type,
  pending,
  onCancel,
  onSubmit,
}: {
  type?: ContactRoleType
  pending: boolean
  onCancel: () => void
  onSubmit: (values: ContactRoleTypeInput) => void
}) {
  const [values, setValues] = useState<ContactRoleTypeInput>(
    type ? toRoleValues(type) : { label: '', showAsTab: false, sortOrder: 100 },
  )

  return (
    <div className="space-y-4">
      {/* One field. A role is a label since migration 0035 — no code that has
          to be fixed on creation, no system flag, no active flag. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="role-label">{strings.contactType.label}</Label>
          <Input
            id="role-label"
            className="mt-2"
            value={values.label}
            onChange={(event) => setValues({ ...values, label: event.target.value })}
          />
          <p className="mt-1 text-muted-foreground text-xs">{strings.contactType.roleLabelHint}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id="role-tab"
          label={strings.contactType.showAsTab}
          checked={values.showAsTab}
          onChange={(checked) => setValues({ ...values, showAsTab: checked })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || values.label.trim() === ''}
          onClick={() => onSubmit(values)}
        >
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ relation types

export function RelationTypeSettings() {
  const { invalidate, onError } = useCatalogue('contact-relation-types')
  const types = useQuery(relationTypeListQueryOptions(true))
  const detail = useInlineDetail()
  const [creating, setCreating] = useState(false)

  const save = useMutation({
    mutationFn: (input: { id?: string; values: ContactRelationTypeCreate }) =>
      input.id
        ? updateRelationType(input.id, input.values)
        : createRelationType(input.values).then(() => undefined),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      setCreating(false)
      toast.success(strings.contactType.saved)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteRelationType(id),
    onSuccess: async () => {
      await invalidate()
      detail.close()
      toast.success(strings.contactType.deleted)
    },
    onError,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; delta: 1 | -1 }) => moveRelationType(input.id, input.delta),
    onSuccess: invalidate,
    onError,
  })

  const rows = types.data ?? []

  return (
    <>
      <ListCard>
        <ListCardTitleBar
          title={strings.contactType.relationCardTitle}
          hint={strings.contactType.relationsHint}
          action={
            <Button
              size="sm"
              onClick={() => {
                detail.close()
                setCreating((current) => !current)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {strings.contactType.createRelation}
            </Button>
          }
        />

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <RelationTypeForm
              pending={save.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={(values) => save.mutate({ values })}
            />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {types.isPending ? strings.status.loading : strings.contactType.emptyRelations}
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((type, index) => (
                <Fragment key={type.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      setCreating(false)
                      detail.toggle(type.id)
                    }}
                  >
                    <TableCell>
                      <span className="font-medium">{type.labelForward}</span>
                      {/* Only on a system entry (B1d). There the code is what
                          the software greps for and is worth seeing; on an own
                          type it is a slug nobody chose, and printing it in the
                          list would invite someone to treat it as a name. */}
                      {type.isSystem && (
                        <span className="ml-2 text-muted-foreground text-xs">{type.code}</span>
                      )}
                      {type.isExclusive && (
                        <Badge variant="outline" className="ml-2">
                          {strings.contactType.exclusiveBadge}
                        </Badge>
                      )}
                      {type.isSymmetric && (
                        <Badge variant="outline" className="ml-2">
                          {strings.contactType.symmetricBadge}
                        </Badge>
                      )}
                      {type.isSystem && (
                        <Badge
                          variant="secondary"
                          className="ml-2"
                          title={strings.contactType.systemHint}
                        >
                          {strings.contactType.systemBadge}
                        </Badge>
                      )}
                      {/* The direction in words, as the design writes it — not
                          "A ↔ B", which states the two labels and leaves the
                          reader to work out which end owns the fact (K4). */}
                      <span className="ml-2 text-muted-foreground text-xs">
                        {relationSummary(type)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ActiveStatus active={type.active} />
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <OrderButtons
                        index={index}
                        count={rows.length}
                        pending={move.isPending}
                        onMove={(i, delta) => {
                          const row = rows[i]
                          if (row) move.mutate({ id: row.id, delta: delta as 1 | -1 })
                        }}
                      />
                    </TableCell>
                  </TableRow>

                  {detail.isOpen(type.id) && (
                    <InlineDetailRow colSpan={3}>
                      {detail.editing ? (
                        <RelationTypeForm
                          type={type}
                          pending={save.isPending}
                          onCancel={detail.stopEditing}
                          onSubmit={(values) => save.mutate({ id: type.id, values })}
                        />
                      ) : (
                        <div className="space-y-4">
                          {/* A system entry has no "Bearbeiten" (B1e). Since
                              B1b it is read-only apart from `active`, so the
                              button led to a form of five values one could not
                              touch and a single checkbox — a control promising
                              an edit and delivering almost none.
                              `SystemTypeReadOnlyError` on the server is the
                              rule; this is the screen stopping short of asking
                              for it. */}
                          {type.isSystem && (
                            <p className="max-w-prose text-muted-foreground text-sm">
                              {strings.contactType.systemReadOnlyHint}
                            </p>
                          )}

                          <dl className="flex flex-wrap gap-8">
                            {type.isSystem && (
                              <DetailField label={strings.contactType.code} value={type.code} />
                            )}
                            <DetailField
                              label={strings.contactType.labelInverse}
                              value={type.labelInverse ?? DASH}
                            />
                          </dl>

                          {/* "Aktiv" stays reachable, because a practice that
                              never bills a third party may take the entry out
                              of the picker (B1b). It acts immediately and has
                              no save button — a single decision, not a record
                              being edited, which is how a role in the contact
                              header behaves for the same reason. */}
                          {type.isSystem && (
                            <CheckboxField
                              id={`relation-active-${type.id}`}
                              label={strings.contactType.active}
                              hint={strings.contactType.systemActiveHint}
                              checked={type.active}
                              onChange={(checked) =>
                                save.mutate({
                                  id: type.id,
                                  values: { ...toRelationValues(type), active: checked },
                                })
                              }
                            />
                          )}

                          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                            {!type.isSystem && (
                              <Button size="sm" variant="outline" onClick={detail.startEditing}>
                                {strings.actions.edit}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={detail.close}>
                              {strings.actions.close}
                            </Button>
                            <DeleteButton
                              disabled={type.isSystem}
                              onConfirm={() => remove.mutate(type.id)}
                              hint={type.isSystem ? strings.contactType.systemHint : undefined}
                              title={strings.contactType.deleteTitle}
                              body={strings.contactType.deleteBody}
                            />
                          </div>
                        </div>
                      )}
                    </InlineDetailRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
      {/* The sentence the design puts under the card — it answers the question
          the list itself raises, so it belongs below it, not in the title bar (K3). */}
      <p className="mt-3 text-muted-foreground text-sm">{strings.contactType.relationsFooter}</p>
    </>
  )
}

function toRelationValues(type: ContactRelationType): ContactRelationTypeCreate {
  return {
    labelForward: type.labelForward,
    labelInverse: type.labelInverse,
    isSymmetric: type.isSymmetric,
    isExclusive: type.isExclusive,
    sortOrder: type.sortOrder,
    active: type.active,
  }
}

function RelationTypeForm({
  type,
  pending,
  onCancel,
  onSubmit,
}: {
  type?: ContactRelationType
  pending: boolean
  onCancel: () => void
  onSubmit: (values: ContactRelationTypeCreate) => void
}) {
  const [values, setValues] = useState<ContactRelationTypeCreate>(
    type
      ? toRelationValues(type)
      : {
          labelForward: '',
          labelInverse: '',
          isSymmetric: false,
          isExclusive: false,
          sortOrder: 100,
          active: true,
        },
  )

  const complete =
    values.labelForward.trim() !== '' &&
    (values.isSymmetric || (values.labelInverse ?? '').trim() !== '')

  /**
   * There is no branch for a system entry here, and that is not an omission:
   * since B1e the read detail has no "Bearbeiten" for one, so this form is
   * never reached with it. What a system entry may still change — `active` —
   * it changes from the read detail directly, without a form.
   *
   * `SystemTypeReadOnlyError` in `domain/contact-type.ts` is what actually
   * enforces it. A screen that does not ask is the readable half; a server
   * that refuses is the rule.
   */
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{strings.contactType.directionHint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="relation-forward">{strings.contactType.labelForward}</Label>
          <Input
            id="relation-forward"
            className="mt-2"
            value={values.labelForward}
            onChange={(event) => setValues({ ...values, labelForward: event.target.value })}
          />
        </div>
      </div>

      <RadioGroup
        value={values.isSymmetric ? 'mutual' : 'directed'}
        onValueChange={(value) =>
          setValues({
            ...values,
            isSymmetric: value === 'mutual',
            labelInverse: value === 'mutual' ? null : (values.labelInverse ?? ''),
          })
        }
      >
        <div className="flex items-start gap-3">
          <RadioGroupItem value="mutual" id="relation-mutual" className="mt-1" />
          <Label htmlFor="relation-mutual" className="flex-1 cursor-pointer font-normal">
            <span className="block font-medium text-foreground">
              {strings.contactType.directionMutualLabel}
            </span>
            <span className="block text-muted-foreground text-xs">
              {strings.contactType.directionMutualExample}
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <RadioGroupItem value="directed" id="relation-directed" className="mt-1" />
          <Label htmlFor="relation-directed" className="flex-1 cursor-pointer font-normal">
            <span className="block font-medium text-foreground">
              {strings.contactType.directionDirectedLabel}
            </span>
            <span className="block text-muted-foreground text-xs">
              {strings.contactType.directionDirectedExample}
            </span>
          </Label>
        </div>
      </RadioGroup>

      {!values.isSymmetric && (
        <div>
          <Label htmlFor="relation-inverse">{strings.contactType.labelInverse}</Label>
          <Input
            id="relation-inverse"
            className="mt-2"
            value={values.labelInverse ?? ''}
            onChange={(event) => setValues({ ...values, labelInverse: event.target.value })}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id="relation-exclusive"
          label={strings.contactType.exclusive}
          hint={strings.contactType.exclusiveHint}
          checked={values.isExclusive}
          onChange={(checked) => setValues({ ...values, isExclusive: checked })}
        />
        <CheckboxField
          id="relation-active"
          label={strings.contactType.active}
          checked={values.active}
          onChange={(checked) => setValues({ ...values, active: checked })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button type="button" disabled={pending || !complete} onClick={() => onSubmit(values)}>
          {strings.actions.save}
        </Button>
      </div>
    </div>
  )
}

/**
 * What the direction of a relation type means, in a sentence.
 *
 * Three cases, and they are the design's own: a symmetric type reads the same
 * from both sides, an exclusive one says how many there may be, and a directed
 * one names the counterpart's label — which is the only one of the three that a
 * reader cannot infer from the badges beside it.
 *
 * Symmetric wins over exclusive where a type is both, because "gilt in beide
 * Richtungen" changes what the exclusivity means and has to be read first. No
 * type is both today; the order is stated so the answer is not accidental.
 */
function relationSummary(type: ContactRelationType): string {
  if (type.isSymmetric) return strings.contactType.symmetricSummary
  if (type.isExclusive) return strings.contactType.exclusiveSummary
  return type.labelInverse === null ? '' : strings.contactType.counterpartSummary(type.labelInverse)
}
