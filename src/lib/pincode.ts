/**
 * PIN code -> state/UT, dependency-free and shared by the browser forms and the API.
 *
 * India Post PIN codes are 6 digits: the first digit is the zone, the first two the sub-zone/postal circle, the first
 * three the sorting district. Circles follow state borders except where a sorting district straddles them, so the
 * lookup resolves in three steps, most specific first:
 *   1. RANGE_OVERRIDES: exact PIN ranges for the few places that sit inside another state's prefix
 *      (Chandigarh inside 160, Puducherry's enclaves, Lakshadweep inside 682, Roorkee inside 247, ...);
 *   2. THREE_DIGIT: prefixes that differ from their two-digit circle (Ladakh 194, Goa 403, Sikkim 737, the north-east ...);
 *   3. TWO_DIGIT: the circle.
 * Army/Field Post Office codes (90-99) belong to no state and return null. The table is a typing aid, not an address
 * authority: the courier's serviceability answer (city and state) wins when the API has one, and forms only fill empty
 * fields. Source: India Post "PIN code" zone/sub-zone structure (https://www.indiapost.gov.in/), cross-checked with the
 * circle lists on https://en.wikipedia.org/wiki/Postal_Index_Number.
 */
import { INDIAN_STATES_AND_UTS } from './checkout/validation';

export type IndianState = (typeof INDIAN_STATES_AND_UTS)[number];

const TWO_DIGIT: Record<string, IndianState> = {
  '11': 'Delhi',
  '12': 'Haryana', '13': 'Haryana',
  '14': 'Punjab', '15': 'Punjab', '16': 'Punjab',
  '17': 'Himachal Pradesh',
  '18': 'Jammu and Kashmir', '19': 'Jammu and Kashmir',
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh', '23': 'Uttar Pradesh', '24': 'Uttar Pradesh',
  '25': 'Uttar Pradesh', '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan',
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra', '43': 'Maharashtra', '44': 'Maharashtra',
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  '50': 'Telangana',
  '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha',
  '78': 'Assam',
  '80': 'Bihar', '81': 'Bihar', '82': 'Bihar', '84': 'Bihar', '85': 'Bihar',
  '83': 'Jharkhand',
};

/** Sorting districts whose state differs from their two-digit circle. */
const THREE_DIGIT: Record<string, IndianState> = {
  // Ladakh (Leh, Kargil) inside the J&K circle.
  '194': 'Ladakh',
  // Goa inside the Maharashtra circle (402 Raigad stays Maharashtra).
  '403': 'Goa',
  // Uttarakhand inside the UP circle: Dehradun, Haridwar/Tehri, Pauri, Pithoragarh, Nainital/Almora.
  '246': 'Uttarakhand', '248': 'Uttarakhand', '249': 'Uttarakhand', '262': 'Uttarakhand', '263': 'Uttarakhand',
  // Jharkhand inside the Bihar circle (Dumka, Giridih, Sahibganj, Palamu, Hazaribagh, Dhanbad, Bokaro, Ramgarh).
  '814': 'Jharkhand', '815': 'Jharkhand', '816': 'Jharkhand', '822': 'Jharkhand',
  '825': 'Jharkhand', '826': 'Jharkhand', '827': 'Jharkhand', '828': 'Jharkhand', '829': 'Jharkhand',
  // Sikkim and the Andaman and Nicobar Islands inside the West Bengal circle.
  '737': 'Sikkim',
  '744': 'Andaman and Nicobar Islands',
  // North-east: the 79 circle is split by sorting district.
  '790': 'Arunachal Pradesh', '791': 'Arunachal Pradesh', '792': 'Arunachal Pradesh',
  '793': 'Meghalaya', '794': 'Meghalaya',
  '795': 'Manipur',
  '796': 'Mizoram',
  '797': 'Nagaland', '798': 'Nagaland',
  '799': 'Tripura',
};

/** Inclusive 6-digit ranges inside another prefix; checked before the prefix tables. */
const RANGE_OVERRIDES: ReadonlyArray<readonly [from: number, to: number, state: IndianState]> = [
  // 160xxx is Chandigarh, except the SAS Nagar (Mohali) offices which belong to Punjab.
  [160001, 160047, 'Chandigarh'],
  [160048, 160099, 'Punjab'],
  [160100, 160199, 'Chandigarh'],
  // Roorkee (Haridwar district) sits in the Saharanpur sorting district.
  [247661, 247667, 'Uttarakhand'],
  // Dadra and Nagar Haveli (Dadra, Silvassa) and Daman inside Gujarat's 396; Diu inside Junagadh's 362.
  [396193, 396193, 'Dadra and Nagar Haveli and Daman and Diu'],
  [396210, 396240, 'Dadra and Nagar Haveli and Daman and Diu'],
  [362520, 362540, 'Dadra and Nagar Haveli and Daman and Diu'],
  // Puducherry town and Karaikal inside Tamil Nadu's 605/609; Yanam inside Andhra's 533; Mahe inside Kerala's 673.
  [605001, 605014, 'Puducherry'],
  [605101, 605111, 'Puducherry'],
  [609601, 609609, 'Puducherry'],
  [533464, 533464, 'Puducherry'],
  [673310, 673310, 'Puducherry'],
  // Lakshadweep inside Kochi's 682.
  [682551, 682559, 'Lakshadweep'],
];

export const isCompletePincode = (value: string): boolean => /^[1-9]\d{5}$/.test(value.trim());

/** State or union territory a PIN code belongs to, or null for an invalid PIN or an Army/Field Post Office code. */
export function stateFromPincode(pincode: string): IndianState | null {
  const pin = pincode.trim();
  if (!isCompletePincode(pin)) return null;
  const n = Number(pin);
  for (const [from, to, state] of RANGE_OVERRIDES) if (n >= from && n <= to) return state;
  return THREE_DIGIT[pin.slice(0, 3)] ?? TWO_DIGIT[pin.slice(0, 2)] ?? null;
}

/** Names couriers and older records use for the official state names (lower-case, "&" and punctuation folded). */
const STATE_ALIASES: Record<string, IndianState> = {
  'orissa': 'Odisha',
  'uttaranchal': 'Uttarakhand',
  'pondicherry': 'Puducherry',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'andaman nicobar islands': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra nagar haveli daman diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'chattisgarh': 'Chhattisgarh',
};

const fold = (name: string) => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Maps a courier's or user's spelling of a state to the official name used by the address forms, or null. */
export function matchStateName(name: string | null | undefined): IndianState | null {
  if (!name) return null;
  const key = fold(name);
  return INDIAN_STATES_AND_UTS.find(s => fold(s) === key) ?? STATE_ALIASES[key] ?? null;
}

export interface PincodeHint { city?: string | null; state?: string | null }
export interface AddressPlace { city: string; state: string }
export type PlacePatch = Partial<AddressPlace>;

/**
 * What to put in the city/state fields for a PIN, never overwriting what the person typed: a field is filled when it is
 * empty, or when it still holds the value this helper put there for the previous PIN (so correcting a mistyped PIN
 * corrects the autofill too). `lastFilled` is what the caller remembers from the previous call.
 */
export function placePatch(current: AddressPlace, lastFilled: PlacePatch, hint: PincodeHint): PlacePatch {
  const patch: PlacePatch = {};
  const state = matchStateName(hint.state);
  const city = hint.city?.trim();
  const canFill = (field: keyof AddressPlace) => current[field].trim() === '' || current[field] === lastFilled[field];
  if (state && state !== current.state && canFill('state')) patch.state = state;
  if (city && city !== current.city && canFill('city')) patch.city = city;
  return patch;
}
