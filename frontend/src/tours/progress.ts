import { reactive } from 'vue'
import { tutorialApi } from '@/api/tutorial'
import { freshTutorial, readTutorial, type TutorialState } from './tour.rules'

/**
 * A person's tour progress, saved on the server per person (/me/tutorial) so it follows them to any computer, with a
 * copy in this browser for when the server cannot be reached. Saving is quiet: a failure never interrupts the person.
 */
export const progress = reactive({
  /** Whose progress this is (the user code); empty until a person is known. */
  owner: '',
  loaded: false,
  state: freshTutorial() as TutorialState,
})

const localKey = (owner: string) => `zora.tutorial.${owner}`

function readLocal(owner: string): TutorialState | null {
  try {
    const raw = localStorage.getItem(localKey(owner))
    return raw ? readTutorial(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(owner: string, state: TutorialState): void {
  try {
    localStorage.setItem(localKey(owner), JSON.stringify(state))
  } catch {
    /* private mode: the server copy is enough */
  }
}

let loadToken = 0

/** Loads the person's progress; a newer load (the person switched again) wins. */
export async function loadProgress(owner: string): Promise<void> {
  const token = ++loadToken
  progress.owner = owner
  progress.loaded = false
  let state: TutorialState
  try {
    state = readTutorial(await tutorialApi.get())
    writeLocal(owner, state)
  } catch {
    state = readLocal(owner) ?? freshTutorial()
  }
  if (token !== loadToken) return
  progress.state = state
  progress.loaded = true
}

export function clearProgress(): void {
  loadToken++
  progress.owner = ''
  progress.loaded = false
  progress.state = freshTutorial()
}

/** Who the next request goes out as (the dev user header, or the signed-in person); set by the tour layer. */
let currentOwner: () => string = () => progress.owner
export function setOwnerSource(source: () => string): void {
  currentOwner = source
}

// One save at a time, the latest state last: changes made while a save is out are sent together after it.
let saving: Promise<void> | null = null
let pending: { owner: string; state: TutorialState } | null = null

async function flush(): Promise<void> {
  while (pending) {
    const { owner, state } = pending
    pending = null
    // The person switched in the meantime: the request would go out as someone else, so keep it in this browser only.
    if (owner !== currentOwner()) {
      writeLocal(owner, state)
      continue
    }
    try {
      await tutorialApi.save(state)
    } catch {
      /* kept in this browser; the next change tries again */
    }
    writeLocal(owner, state)
  }
  saving = null
}

/** Changes the progress and saves it. */
export function updateProgress(change: (state: TutorialState) => TutorialState): void {
  if (!progress.owner) return
  progress.state = change(progress.state)
  pending = { owner: progress.owner, state: progress.state }
  saving ??= flush()
}

/** Waits until every change is saved (before switching person). */
export async function progressSaved(): Promise<void> {
  await saving
}

export async function resetProgress(): Promise<void> {
  await progressSaved()
  try {
    progress.state = readTutorial(await tutorialApi.reset())
  } catch {
    progress.state = freshTutorial()
  }
  writeLocal(progress.owner, progress.state)
}
