import { type StartPage, startPageOptions } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { strings } from '@/lib/strings'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'

/**
 * A user preference, applied immediately like `ThemePicker` — no buffered
 * form state, no separate Speichern (CLAUDE.md, account dialog). Unlike the
 * theme, changing this has no effect visible on screen: it only matters at
 * the next sign-in, so a confirmation toast says the save happened at all.
 */
export function StartPagePicker() {
  const queryClient = useQueryClient()
  const { data } = useQuery(userPreferencesQueryOptions)
  const startPage = data?.startPage ?? 'overview'

  const mutation = useMutation({
    mutationFn: (value: StartPage) => updateUserPreferences({ startPage: value }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(userPreferencesQueryKey, preferences)
      toast.success(strings.preferences.startPage.saved)
    },
  })

  return (
    <div>
      <Label htmlFor="start-page-picker" className="text-muted-foreground text-xs">
        {strings.preferences.startPage.label}
      </Label>
      <Select value={startPage} onValueChange={(value) => mutation.mutate(value as StartPage)}>
        <SelectTrigger id="start-page-picker" size="sm" className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {startPageOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {strings.preferences.startPage.options[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
