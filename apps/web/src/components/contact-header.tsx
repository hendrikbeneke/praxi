import { ageInYears, type Contact, formatContactName } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ApiError } from '@/lib/api'
import { roleTypeListQueryOptions } from '@/lib/contact-types'
import { contactQueryOptions, setContactRoles } from '@/lib/contacts'
import { strings } from '@/lib/strings'

/**
 * Who this record is, on every tab: name, contact number, age and the roles.
 *
 * The roles are edited right here and save on the click — there is no edit
 * mode and no save button, because ticking "Patient" is one decision and not
 * a form. `since` is set to today when a role is ticked and shown nowhere: on
 * the day you tick it, today is the only answer that can be meant.
 */
export function ContactHeader({
  contact,
  actions,
}: {
  contact: Contact
  actions?: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const types = useQuery(roleTypeListQueryOptions(true))

  const save = useMutation({
    mutationFn: (roles: Contact['roles']) => setContactRoles(contact.id, roles),
    onSuccess: async (saved) => {
      queryClient.setQueryData(contactQueryOptions(contact.id).queryKey, saved)
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : strings.contact.saveFailed),
  })

  const held = new Map(contact.roles.map((entry) => [entry.roleCode, entry.since]))

  /**
   * Active types, plus any the contact already holds. Without the second half
   * a role whose type was deactivated afterwards could never be taken off
   * again — it would not be in the list to untick.
   */
  const roleTypes = (types.data ?? []).filter((type) => type.active || held.has(type.code))

  const toggle = (code: string, checked: boolean) => {
    const next = checked
      ? [...contact.roles, { roleCode: code, since: todayInBerlin() }]
      : contact.roles.filter((entry) => entry.roleCode !== code)

    save.mutate(next)
  }

  const age = contact.dateOfBirth ? ageInYears(contact.dateOfBirth, new Date()) : null

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{formatContactName(contact)}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm">
          <span className="tabular-nums">
            {strings.contact.contactNumber} {contact.contactNumber}
          </span>
          {age !== null && <span>{strings.contact.ageYears(age)}</span>}
          {contact.archivedAt && <Badge variant="secondary">{strings.contact.archivedBadge}</Badge>}

          <span className="flex flex-wrap items-center gap-1">
            {contact.roles.length === 0 ? (
              <span className="text-xs">{strings.contact.noRoles}</span>
            ) : (
              contact.roles.map((entry) => (
                <Badge key={entry.roleCode} variant="outline">
                  {label(types.data, entry.roleCode)}
                </Badge>
              ))
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={strings.contact.editRoles}
                  disabled={save.isPending}
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64">
                <p className="mb-3 font-medium text-foreground text-sm">
                  {strings.contact.roleLabel}
                </p>
                <div className="space-y-2">
                  {roleTypes.map((type) => (
                    <div key={type.code} className="flex items-center gap-3">
                      <Checkbox
                        id={`header-role-${type.code}`}
                        checked={held.has(type.code)}
                        disabled={save.isPending}
                        onCheckedChange={(value) => toggle(type.code, value === true)}
                      />
                      <Label htmlFor={`header-role-${type.code}`} className="font-normal">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </span>
        </div>
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A role whose type has vanished should still read as something. */
function label(types: { code: string; label: string }[] | undefined, code: string): string {
  return types?.find((type) => type.code === code)?.label ?? code
}

/** Today in Europe/Berlin as `YYYY-MM-DD`. `toISOString()` would be UTC and
 *  give yesterday's date late in the evening. */
function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}
