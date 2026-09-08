import { type Theme, themeOptions } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { strings } from '@/lib/strings'
import { applyTheme } from '@/lib/theme'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'

/**
 * A user preference, not a practice setting — see CLAUDE.md and
 * `domain/user-preferences.ts`. Lives in the account dialog (`account-menu.tsx`),
 * reached from the topbar's user menu.
 */
export function ThemePicker() {
  const queryClient = useQueryClient()
  const { data } = useQuery(userPreferencesQueryOptions)
  const theme = data?.theme ?? 'slate'

  const mutation = useMutation({
    mutationFn: (value: Theme) => updateUserPreferences({ theme: value }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(userPreferencesQueryKey, preferences)
      // The picked theme takes effect here and now; the next load gets it
      // from the cookie the server set in the same response. Applying it in
      // an effect on this component was what kept the stored theme from ever
      // reaching a page this picker is not on (L4).
      applyTheme(preferences.theme)
    },
  })

  return (
    <div>
      <Label htmlFor="theme-picker" className="text-muted-foreground text-xs">
        {strings.preferences.theme.label}
      </Label>
      <Select value={theme} onValueChange={(value) => mutation.mutate(value as Theme)}>
        <SelectTrigger id="theme-picker" size="sm" className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {themeOptions.map((option) => (
            <SelectItem key={option} value={option}>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  data-theme={option === 'slate' ? undefined : option}
                  className="inline-block size-3 shrink-0 rounded-full border border-border bg-primary"
                />
                {strings.preferences.theme.options[option]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
