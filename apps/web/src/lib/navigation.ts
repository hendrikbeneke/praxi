import type { StartPage } from '@praxi/shared'
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react'
import { strings } from '@/lib/strings'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
}

/**
 * The one list of top-level areas — read by the sidebar to render the links
 * and by the topbar to derive the active section's breadcrumb label,
 * so the two cannot drift into naming a section differently.
 */
export const navigation: readonly NavItem[] = [
  { to: '/', label: strings.nav.dashboard, icon: LayoutDashboard },
  { to: '/contacts', label: strings.nav.contacts, icon: Users },
  { to: '/appointments', label: strings.nav.appointments, icon: CalendarDays },
  { to: '/activities', label: strings.nav.activities, icon: ClipboardList },
  { to: '/payments', label: strings.nav.payments, icon: Wallet },
  { to: '/services', label: strings.nav.services, icon: Stethoscope },
  { to: '/settings', label: strings.nav.settings, icon: Settings },
]

const startPagePaths: Record<StartPage, string> = {
  overview: '/',
  contacts: '/contacts',
  calendar: '/appointments',
  activities: '/activities',
}

/** Where the `startPage` preference sends a fresh sign-in — `login.tsx`'s
 *  fallback once there is no `redirect` search param to honour instead. */
export function startPagePath(startPage: StartPage | undefined): string {
  return startPage ? startPagePaths[startPage] : '/'
}
