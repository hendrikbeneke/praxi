import { ageInYears, type Contact, formatContactName } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { roleTypeListQueryOptions } from '@/lib/contact-types'
import { strings } from '@/lib/strings'

/**
 * Who this record is, on every tab — and the strip the tab row sits in.
 *
 * The design makes this a full-bleed bar in card colour that sticks to the top
 * of the scroll area, and that is not decoration: the bar's bottom border is
 * what the tab underline runs along, so the line spans the whole field rather
 * than ending where the content is capped. The route owns the tabs and passes
 * them as children, because they are its state; everything above them is here.
 *
 * The roles are badges and nothing more. Until K6 this header carried a pencil
 * and a popover that edited them, which was a second way to the same data next
 * to the master data form — the design has it in one place, and so does this.
 */
export function ContactHeader({
  contact,
  actions,
  children,
}: {
  contact: Contact
  actions?: ReactNode
  children?: ReactNode
}) {
  // Inactive types included: a contact may still hold one, and its badge has
  // to read as a name rather than as a code.
  const types = useQuery(roleTypeListQueryOptions(true))
  const label = (code: string) => types.data?.find((type) => type.code === code)?.label ?? code

  const age = contact.dateOfBirth ? ageInYears(contact.dateOfBirth, new Date()) : null

  return (
    <div className="sticky top-0 z-5 border-b bg-card px-8 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-7">
        <div className="min-w-0">
          {/* Number and age stand in the name line, not in a meta line of
              their own: they identify the person as much as the name does. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-semibold text-[26px] leading-[1.1] tracking-[-0.022em]">
              {formatContactName(contact)}
            </h1>
            <span className="text-muted-foreground tabular-nums">
              {strings.contact.numberShort} {contact.contactNumber}
            </span>
            {age !== null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{strings.contact.ageYears(age)}</span>
              </>
            )}
            {contact.archivedAt && (
              <Badge variant="secondary">{strings.contact.archivedBadge}</Badge>
            )}
          </div>

          <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
            {contact.roles.length === 0 ? (
              <span className="text-muted-foreground text-xs">{strings.contact.noRoles}</span>
            ) : (
              contact.roles.map((entry) => (
                <Badge key={entry.roleCode} variant="outline">
                  {label(entry.roleCode)}
                </Badge>
              ))
            )}
          </div>
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="mt-4 flex gap-0.5">{children}</div>
    </div>
  )
}
