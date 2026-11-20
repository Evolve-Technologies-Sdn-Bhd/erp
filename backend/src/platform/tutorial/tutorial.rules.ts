/**
 * A person's guided tours (Help, in-app tutorial): whether tours are offered, whether they saw the welcome, which tours
 * they finished and a tour they left mid-way. No business rules: the tours themselves live in the frontend.
 */

/** "welcome", "sales.order.create": lower case, dots or dashes between the parts. */
export const TOUR_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
export const TOUR_ID_MAX = 60;
/** More tours than the app will ever have; keeps a broken client from growing the row without end. */
export const MAX_DONE = 200;
export const MAX_STEP = 99;
export const PATH_MAX = 300;

export interface ActiveTour {
  tourId: string;
  /** The step the person was on, counted from 0. */
  step: number;
  /** The page it was on, so Resume can go back there. */
  path: string;
  paused: boolean;
}

export interface TutorialState {
  /** Tutorial mode: on offers tours (the welcome card, "Tour this page"); off shows them only from Help. */
  mode: boolean;
  welcomeSeen: boolean;
  done: string[];
  active: ActiveTour | null;
}

export const DEFAULT_TUTORIAL: TutorialState = { mode: true, welcomeSeen: false, done: [], active: null };

const isTourId = (v: unknown): v is string => typeof v === 'string' && v.length <= TOUR_ID_MAX && TOUR_ID.test(v);

function readActive(v: unknown): ActiveTour | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  if (!isTourId(a.tourId) || !Number.isInteger(a.step) || (a.step as number) < 0 || (a.step as number) > MAX_STEP) return null;
  if (typeof a.path !== 'string' || !a.path.startsWith('/') || a.path.length > PATH_MAX) return null;
  return { tourId: a.tourId, step: a.step as number, path: a.path, paused: a.paused === true };
}

/** What a saved row reads as. Anything unreadable falls back to the default instead of failing the page. */
export function readTutorial(row: { mode: boolean; welcomeSeen: boolean; done: unknown; active: unknown } | null): TutorialState {
  if (!row) return { ...DEFAULT_TUTORIAL, done: [] };
  const done = Array.isArray(row.done) ? row.done.filter(isTourId) : [];
  return { mode: row.mode, welcomeSeen: row.welcomeSeen, done: [...new Set(done)].slice(0, MAX_DONE), active: readActive(row.active) };
}

/** The state to save: each finished tour once, in the order finished. */
export function cleanTutorial(input: TutorialState): TutorialState {
  return {
    mode: input.mode,
    welcomeSeen: input.welcomeSeen,
    done: [...new Set(input.done)],
    active: input.active ? { tourId: input.active.tourId, step: input.active.step, path: input.active.path, paused: input.active.paused } : null,
  };
}
