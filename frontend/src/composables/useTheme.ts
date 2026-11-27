import { ref } from 'vue'

/** Light or dark (U5, MES ThemeToggler): a class on <html>, remembered on this device. Applied before the app mounts. */
const KEY = 'zora.theme'

function stored(): 'light' | 'dark' {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const theme = ref<'light' | 'dark'>(stored())

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
}

export function useTheme() {
  function flip() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, theme.value)
    } catch {
      /* private mode: lasts until reload */
    }
    applyTheme()
  }

  /**
   * The new theme grows as a circle from the click point (MES ThemeProvider): the browser snapshots the page,
   * the theme flips inside the transition, and the new layer is uncovered over 800 ms. Browsers without view
   * transitions, and people who turned motion off, get the switch at once.
   */
  function toggle(event?: MouseEvent) {
    const start = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } })
      .startViewTransition
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!start || still) return flip()
    const x = event?.clientX ?? window.innerWidth / 2
    const y = event?.clientY ?? 0
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const transition = start.call(document, flip)
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 800, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => {
        /* the switch already happened; only the animation was skipped */
      })
  }
  return { theme, toggle }
}
