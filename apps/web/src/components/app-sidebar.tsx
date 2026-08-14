import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { navigation } from '@/lib/navigation'
import { practiceSettingsQueryOptions } from '@/lib/settings'
import { strings } from '@/lib/strings'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'

/**
 * The collapsed state is one preference, not a local `useState` plus a
 * separate "start collapsed" checkbox in the account dialog — see D3's plan.
 * The toggle writes optimistically so the click feels instant; a failed
 * write rolls back to what the server actually has once the query refetches.
 */
export function AppSidebar() {
  const queryClient = useQueryClient()
  const { data: preferences } = useQuery(userPreferencesQueryOptions)
  const { data: practiceSettings } = useQuery(practiceSettingsQueryOptions)
  const collapsed = preferences?.sidebarCollapsed ?? false

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => updateUserPreferences({ sidebarCollapsed: next }),
    onMutate: (next) => {
      queryClient.setQueryData(userPreferencesQueryKey, (current) => ({
        ...(current ?? {}),
        sidebarCollapsed: next,
      }))
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(userPreferencesQueryKey, saved)
    },
  })

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  const toggleTitle = collapsed ? strings.nav.expand : strings.nav.collapse

  return (
    <aside
      className={`flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 ${collapsed ? 'w-[62px]' : 'w-[234px]'}`}
    >
      <div
        className={`flex min-h-[57px] items-center gap-2 border-b px-3.5 py-3.5 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[15px] tracking-tight">
              {strings.app.shortTitle}
            </p>
            {practiceSettings && (
              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                {practiceSettings.practiceName}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          title={toggleTitle}
          aria-label={toggleTitle}
          onClick={() => toggleMutation.mutate(!collapsed)}
          className="flex size-[30px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ToggleIcon className="size-[17px]" aria-hidden />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-2.5">
        {navigation.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            // `activeOptions` keeps "Übersicht" from lighting up on every
            // page just because every path starts with "/".
            activeOptions={{ exact: to === '/' }}
            className={`flex items-center gap-[11px] overflow-hidden whitespace-nowrap rounded-md px-[11px] py-[7px] text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-accent-foreground ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
