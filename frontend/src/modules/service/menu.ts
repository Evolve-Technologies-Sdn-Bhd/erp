import { BellRing, CalendarDays, ClipboardList, Receipt, SlidersHorizontal, Wrench } from '@lucide/vue'
import type { MenuGroup } from '../common/menu'

/** Service sidebar (SvcHome.html and the other Svc mockups). Labels as in the mockups. */
export const SERVICE_MENU: MenuGroup[] = [
  {
    key: 'planning',
    title: 'Planning',
    icon: Wrench,
    to: '/service/jobs',
    items: [
      { key: 'board', label: 'Planning Board', to: '/service/board', icon: CalendarDays },
      { key: 'jobs', label: 'Jobs', to: '/service/jobs', icon: ClipboardList },
      { key: 'reminders', label: 'Reminders', to: '/service/reminders', icon: BellRing },
      { key: 'claims', label: 'Installer Claims', to: '/service/claims', icon: Receipt },
    ],
  },
  {
    key: 'setup',
    title: 'Settings',
    icon: SlidersHorizontal,
    to: '/service/settings',
    items: [{ key: 'settings', label: 'Slots and Stages', to: '/service/settings', icon: SlidersHorizontal }],
  },
]
