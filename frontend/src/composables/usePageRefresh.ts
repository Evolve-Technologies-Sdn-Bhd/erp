import { ref } from 'vue'

/** Counts up to draw the open page again, loading it afresh (App.vue's page key). */
export const pageVersion = ref(0)

/**
 * Draws the open page again. For an action finished on a document that was new a moment ago: saving it moved to its own
 * address, so the page on screen was drawn (and loaded) before the action and would go on showing the draft.
 */
export function refreshPage(): void {
  pageVersion.value++
}
