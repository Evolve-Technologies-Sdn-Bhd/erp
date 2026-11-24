import { reactive } from 'vue'
import { tutorialApi } from '@/api/tutorial'

/**
 * The company's own words for the guides (people, items, numbers), from a file on the server that is not in this
 * repository. Without it, or while it has not arrived, the guides use their neutral words.
 */
export const companyWords = reactive({ values: {} as Record<string, Record<string, string>> })

export async function loadGuideValues(mode: string): Promise<void> {
  if (mode !== 'dev') return void (companyWords.values = {})
  try {
    companyWords.values = (await tutorialApi.guideValues()).values ?? {}
  } catch {
    /* neutral words */
  }
}
