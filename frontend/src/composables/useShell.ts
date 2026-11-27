import { reactive, watch } from 'vue'

/**
 * The frame's own state, shared by the top bar, the sidebar and the layout (MES useSidebar): the sidebar folded to a
 * strip of tiles on a desktop (remembered on this device), and the sidebar slid in over the page on a phone or tablet.
 */
const COLLAPSED_KEY = 'zora.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const state = reactive({ collapsed: readCollapsed(), mobileOpen: false })

watch(
  () => state.collapsed,
  (v) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0')
    } catch {
      /* private mode: the choice lasts until reload */
    }
  },
)

export function useShell() {
  return state
}
