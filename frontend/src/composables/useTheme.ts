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
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, theme.value)
    } catch {
      /* private mode: lasts until reload */
    }
    applyTheme()
  }
  return { theme, toggle }
}
