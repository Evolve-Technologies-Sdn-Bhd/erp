/**
 * Words a guide fills in (Help › Guides): the people, items and numbers of one company's demo, so a guide reads exactly
 * like that company's handbook. They come from a file outside the repository (GUIDE_VALUES_FILE); without it the guides
 * use neutral words. Only words: nothing here changes what a guide does.
 */
export const KEY = /^[a-zA-Z]\w{0,39}$/;
export const VALUE_MAX = 200;

/** Per guide id, or "common" for every guide: { "common": { "agent": "AG1" }, "guide.field-sales.a": { … } } */
export type GuideValues = Record<string, Record<string, string>>;

/** What the file holds, read safely: anything that is not a short word under a plain name is left out. */
export function readGuideValues(value: unknown): GuideValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: GuideValues = {};
  for (const [guide, words] of Object.entries(value)) {
    if (!words || typeof words !== 'object' || Array.isArray(words)) continue;
    const kept = Object.entries(words).filter((e): e is [string, string] => KEY.test(e[0]) && typeof e[1] === 'string' && e[1].length <= VALUE_MAX);
    if (kept.length) out[guide] = Object.fromEntries(kept);
  }
  return out;
}
