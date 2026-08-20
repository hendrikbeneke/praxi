import type { Service, ServiceGroup } from '@praxi/shared'
import { formatEuro } from '@praxi/shared'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { strings } from '@/lib/strings'

/**
 * **One picker for the catalogue** — services and groups in a single list,
 * under two headings (D-K3, design image 14).
 *
 * It replaces two dropdowns standing side by side, and the reason is not
 * tidiness: they asked the same question. "Which of the things I have priced
 * belongs on this Vorgang" is one decision, and splitting it across two
 * controls meant the practitioner had to know beforehand whether what they
 * wanted was a single service or a bundle — a distinction that exists in the
 * settings and nowhere in their head at the moment of entering a session.
 *
 * **A group is still resolved the moment it is picked** (rule 5): the caller
 * gets one row per member and no group id is stored anywhere. What this
 * component does is narrower than that rule — it only says which of the two
 * kinds was chosen.
 *
 * Used in the calendar and, for now, only there. The invoice draft and the
 * activity type's presets keep their own controls until their screens come up.
 */
export function ServicePicker({
  services,
  groups,
  /** Bumped by the caller to reset the trigger back to its placeholder after a
   *  pick — a Select is a value, and this one is meant to be an action. */
  resetKey,
  onPickService,
  onPickGroup,
}: {
  services: readonly Service[]
  groups: readonly ServiceGroup[]
  resetKey: string | number
  onPickService: (service: Service) => void
  onPickGroup: (group: ServiceGroup) => void
}) {
  /**
   * Ids are unique across both tables, so one namespace would do — but only by
   * accident, and a prefix costs nothing and says which list the value came
   * from at the point where it is read.
   */
  const pick = (value: string) => {
    const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
    if (kind === 'service') {
      const service = services.find((entry) => entry.id === id)
      if (service) onPickService(service)
      return
    }
    const group = groups.find((entry) => entry.id === id)
    if (group) onPickGroup(group)
  }

  return (
    <Select key={resetKey} onValueChange={pick}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={strings.activity.addFromCatalogue} />
      </SelectTrigger>
      <SelectContent>
        {/* Both lists in the order the catalogue is kept in — `sortOrder`
            first, then the name (D5). Neither sorts again here, which is what
            makes the setting reach the picker. */}
        {services.length > 0 && (
          <SelectGroup>
            <SelectLabel>{strings.activity.catalogueServices}</SelectLabel>
            {services.map((service) => (
              <SelectItem key={service.id} value={`service:${service.id}`}>
                {service.description} — {formatEuro(service.defaultPriceCents)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {groups.length > 0 && (
          <SelectGroup>
            <SelectLabel>{strings.activity.catalogueGroups}</SelectLabel>
            {groups.map((group) => (
              <SelectItem key={group.id} value={`group:${group.id}`}>
                {group.name} · {strings.activity.groupSize(group.items.length)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
