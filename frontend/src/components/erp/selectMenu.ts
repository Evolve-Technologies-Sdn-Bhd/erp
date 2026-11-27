/**
 * Every plain <select> opens the ERP's own menu panel instead of the browser's list, so all dropdowns look alike
 * (the same panel as Rows per page, Columns and Download). Installed once in main.ts; no view changes.
 *
 * The <select> stays the real field: v-model, data-tour ids, disabled and the keyboard keep working. Only its list
 * is ours. Picking sets the value and fires `input` and `change`, as the browser would. The panel carries
 * `p-select-overlay` so the tour engine treats it like any other dropdown. A select with `multiple`, a `size`
 * above 1, or `data-native-select` keeps the browser's list.
 */

let panel: HTMLDivElement | null = null
let owner: HTMLSelectElement | null = null
let items: { el: HTMLButtonElement; value: string; disabled: boolean }[] = []
let active = -1

const usesMenu = (s: HTMLSelectElement) => !s.multiple && s.size <= 1 && !s.disabled && !s.hasAttribute('data-native-select')

const CHECK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

function close(refocus = false): void {
  const was = owner
  panel?.remove()
  panel = null
  owner = null
  items = []
  active = -1
  was?.setAttribute('aria-expanded', 'false')
  if (refocus) was?.focus()
}

function place(): void {
  if (!panel || !owner) return
  if (!owner.isConnected) return close()
  const r = owner.getBoundingClientRect()
  const gap = 4
  const below = window.innerHeight - r.bottom - gap - 8
  const above = r.top - gap - 8
  const upward = below < 180 && above > below
  const room = Math.max(120, Math.min(300, upward ? above : below))
  panel.style.maxHeight = `${room}px`
  panel.style.minWidth = `${Math.max(r.width, 140)}px`
  const width = panel.offsetWidth
  panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`
  panel.style.top = upward ? `${Math.max(8, r.top - gap - Math.min(panel.scrollHeight, room))}px` : `${r.bottom + gap}px`
}

function mark(i: number): void {
  items[active]?.el.classList.remove('is-active')
  active = i
  const it = items[i]
  if (!it) return
  it.el.classList.add('is-active')
  it.el.scrollIntoView({ block: 'nearest' })
}

function move(step: 1 | -1): void {
  if (!items.length) return
  let i = active
  for (let n = 0; n < items.length; n++) {
    i = (i + step + items.length) % items.length
    if (!items[i]!.disabled) return mark(i)
  }
}

function pick(value: string): void {
  const s = owner
  close(true)
  if (!s || s.value === value) return
  s.value = value
  s.dispatchEvent(new Event('input', { bubbles: true }))
  s.dispatchEvent(new Event('change', { bubbles: true }))
}

function optionButton(o: HTMLOptionElement, chosen: boolean): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.tabIndex = -1
  b.setAttribute('role', 'option')
  b.setAttribute('aria-selected', String(chosen))
  b.className = 'erp-select-option p-select-option' + (chosen ? ' is-on' : '')
  b.disabled = o.disabled
  const text = document.createElement('span')
  text.className = 'erp-select-text'
  text.textContent = o.label || o.text || ' '
  b.append(text)
  if (chosen) b.insertAdjacentHTML('beforeend', CHECK)
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', () => pick(o.value))
  return b
}

function open(s: HTMLSelectElement): void {
  close()
  owner = s
  panel = document.createElement('div')
  panel.className = 'erp-select-menu p-select-overlay'
  panel.setAttribute('role', 'listbox')
  panel.setAttribute('data-select-menu', '')
  const name = s.getAttribute('aria-label') ?? s.labels?.[0]?.textContent?.trim()
  if (name) panel.setAttribute('aria-label', name)
  // Inside a module the panel takes that module's colour for the picked option.
  const themed = s.closest<HTMLElement>('[data-module]')
  if (themed) panel.setAttribute('data-module', themed.dataset.module ?? '')
  const add = (o: HTMLOptionElement) => {
    if (o.hidden) return
    const chosen = o.selected && s.selectedIndex >= 0
    const el = optionButton(o, chosen)
    items.push({ el, value: o.value, disabled: o.disabled })
    panel!.append(el)
    if (chosen) active = items.length - 1
  }
  for (const child of Array.from(s.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const head = document.createElement('div')
      head.className = 'erp-select-group'
      head.textContent = child.label
      panel.append(head)
      Array.from(child.children).forEach((o) => o instanceof HTMLOptionElement && add(o))
    } else if (child instanceof HTMLOptionElement) add(child)
  }
  document.body.append(panel)
  s.setAttribute('aria-expanded', 'true')
  place()
  if (active >= 0) mark(active)
}

function onMouseDown(e: MouseEvent): void {
  const t = e.target instanceof Element ? e.target : null
  if (panel && t && panel.contains(t)) return
  const s = t?.closest('select')
  if (s instanceof HTMLSelectElement && e.button === 0 && usesMenu(s)) {
    e.preventDefault()
    if (owner === s) return close()
    s.focus()
    open(s)
    return
  }
  if (panel) close()
}

function onKeyDown(e: KeyboardEvent): void {
  if (panel && owner) {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => mark(items.findIndex((i) => !i.disabled)),
      End: () => mark(items.map((i) => !i.disabled).lastIndexOf(true)),
      Enter: () => (items[active] && !items[active]!.disabled ? pick(items[active]!.value) : close(true)),
      ' ': () => (items[active] && !items[active]!.disabled ? pick(items[active]!.value) : close(true)),
      Escape: () => close(true),
    }
    if (e.key === 'Tab') return close()
    const run = keys[e.key]
    if (run) {
      e.preventDefault()
      e.stopPropagation()
      run()
    }
    return
  }
  const s = e.target
  if (!(s instanceof HTMLSelectElement) || !usesMenu(s)) return
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
    e.preventDefault()
    open(s)
  }
}

function onScroll(e: Event): void {
  if (!panel) return
  if (e.target instanceof Node && panel.contains(e.target)) return
  place()
}

let installed = false

/** Called once from main.ts. */
export function installSelectMenus(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', () => close())
  window.addEventListener('blur', () => close())
  window.addEventListener('popstate', () => close())
}
