import { type Theme, themeOptions } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
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

const THEME_STORAGE_KEY = 'praxi-theme'

/**
 * Applies the resolved theme to the document and caches it for the next
 * page load's inline script (index.html) — same key, same "absent means
 * schiefer" convention on both sides.
 */
function applyTheme(theme: Theme | undefined): void {
  if (theme && theme !== 'schiefer') {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } else {
    delete document.documentElement.dataset.theme
    localStorage.removeItem(THEME_STORAGE_KEY)
  }
}

/**
 * A user preference, not a practice setting — see CLAUDE.md and
 * `domain/user-preferences.ts`. Lives in the account dialog (`account-menu.tsx`),
 * reached from the topbar's user menu.
 */
export function ThemePicker() {
  const queryClient = useQueryClient()
  const { data } = useQuery(userPreferencesQueryOptions)
  const theme = data?.theme ?? 'schiefer'

  // Re-applies whenever the server's answer changes — including the very
  // first resolve, which reconciles the inline script's localStorage guess
  // with what is actually stored.
  useEffect(() => {
    applyTheme(data?.theme)
  }, [data?.theme])

  const mutation = useMutation({
    mutationFn: (value: Theme) => updateUserPreferences({ theme: value }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(userPreferencesQueryKey, preferences)
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
                  data-theme={option === 'schiefer' ? undefined : option}
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
