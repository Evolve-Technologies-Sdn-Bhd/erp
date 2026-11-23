/**
 * Address building blocks shared by modules (no business rules): the states and federal territories of Malaysia as
 * an address names them, and the shape of a postcode. One country for now (CLAUDE.md → Phase 5, *Not in this phase*).
 */
export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak',
  'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya',
] as const;

/** Five digits, or empty for none. */
export const POSTCODE_OR_EMPTY = /^(\d{5})?$/;
export const POSTCODE_MESSAGE = 'A postcode is 5 digits.';
export const STATE_MESSAGE = 'Pick the state from the list.';
