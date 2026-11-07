/**
 * GST state codes (first two digits of a GSTIN), keyed by the state / UT names the checkout offers
 * (src/lib/checkout/validation.ts INDIAN_STATES_AND_UTS). Dependency-free: shared by the API (invoice place of
 * supply, api/_lib/gst/stateCodes.ts) and the admin settings form (state filled from the GSTIN).
 */
import { INDIAN_STATES_AND_UTS } from '../lib/checkout/validation';

export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

const normalise = (state: string) => state.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');

/** GST state code for a state / UT name, or null when unknown. */
export function gstStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  return GST_STATE_CODES[normalise(state)] ?? null;
}

/** State / UT name (as the checkout spells it) for a GST state code, or null when unknown. */
export function stateForGstCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return INDIAN_STATES_AND_UTS.find(name => GST_STATE_CODES[normalise(name)] === code) ?? null;
}
