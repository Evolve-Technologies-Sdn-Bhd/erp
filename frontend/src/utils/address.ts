/** The states and federal territories of Malaysia as an address names them (the server checks the same list). */
export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak',
  'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya',
] as const

/** Five digits, or empty for none. */
export const postcodeError = (v: string): string => (v && !/^\d{5}$/.test(v) ? 'A postcode is 5 digits.' : '')
