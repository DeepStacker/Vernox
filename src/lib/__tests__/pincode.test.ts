import { describe, expect, it } from 'vitest';
import { INDIAN_STATES_AND_UTS } from '../checkout/validation';
import { isCompletePincode, matchStateName, placePatch, stateFromPincode } from '../pincode';

// One real GPO / well-known delivery PIN per state and union territory.
const SAMPLES: Record<(typeof INDIAN_STATES_AND_UTS)[number], string[]> = {
  'Andhra Pradesh': ['520001', '530001', '517501'],
  'Arunachal Pradesh': ['791111', '790001'],
  'Assam': ['781001', '786001'],
  'Bihar': ['800001', '842001', '823001'],
  'Chhattisgarh': ['492001', '495001'],
  'Goa': ['403001', '403601'],
  'Gujarat': ['380001', '395003', '396001'],
  'Haryana': ['122001', '121001', '134109'],
  'Himachal Pradesh': ['171001', '176001'],
  'Jharkhand': ['834001', '826001', '831001', '822101'],
  'Karnataka': ['560001', '575001', '580020'],
  'Kerala': ['695001', '682001', '673001'],
  'Madhya Pradesh': ['462001', '452001', '482001'],
  'Maharashtra': ['400001', '411001', '440001', '402201'],
  'Manipur': ['795001'],
  'Meghalaya': ['793001', '794101'],
  'Mizoram': ['796001'],
  'Nagaland': ['797001', '798601'],
  'Odisha': ['751001', '768001'],
  'Punjab': ['141001', '143001', '160055'],
  'Rajasthan': ['302001', '342001'],
  'Sikkim': ['737101'],
  'Tamil Nadu': ['600001', '641001', '605602', '625001'],
  'Telangana': ['500001', '506002'],
  'Tripura': ['799001'],
  'Uttar Pradesh': ['226001', '201301', '247001'],
  'Uttarakhand': ['248001', '263001', '247667'],
  'West Bengal': ['700001', '734001'],
  'Andaman and Nicobar Islands': ['744101'],
  'Chandigarh': ['160017', '160101'],
  'Dadra and Nagar Haveli and Daman and Diu': ['396230', '396210', '362520'],
  'Delhi': ['110001', '110092'],
  'Jammu and Kashmir': ['190001', '180001'],
  'Ladakh': ['194101', '194103'],
  'Lakshadweep': ['682555'],
  'Puducherry': ['605001', '609602', '673310'],
};

describe('stateFromPincode', () => {
  it('has samples for every state and union territory', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...INDIAN_STATES_AND_UTS].sort());
  });

  for (const [state, pins] of Object.entries(SAMPLES)) {
    it(`maps ${state}`, () => {
      for (const pin of pins) expect(stateFromPincode(pin), pin).toBe(state);
    });
  }

  it('only ever returns an official state name', () => {
    for (let n = 100000; n < 1000000; n += 997) {
      const s = stateFromPincode(String(n));
      if (s) expect(INDIAN_STATES_AND_UTS).toContain(s);
    }
  });

  it('returns null for invalid PINs and Army/Field Post Office codes', () => {
    for (const pin of ['', '12345', '1234567', '012345', 'abcdef', '900001', '992001']) expect(stateFromPincode(pin), pin).toBeNull();
  });

  it('trims whitespace', () => expect(stateFromPincode(' 560001 ')).toBe('Karnataka'));
});

describe('isCompletePincode', () => {
  it('needs six digits not starting with 0', () => {
    expect(isCompletePincode('560001')).toBe(true);
    expect(isCompletePincode('060001')).toBe(false);
    expect(isCompletePincode('56000')).toBe(false);
  });
});

describe('matchStateName', () => {
  it('accepts official names, courier spellings and old names', () => {
    expect(matchStateName('KARNATAKA')).toBe('Karnataka');
    expect(matchStateName('Jammu & Kashmir')).toBe('Jammu and Kashmir');
    expect(matchStateName('Orissa')).toBe('Odisha');
    expect(matchStateName('Pondicherry')).toBe('Puducherry');
    expect(matchStateName('NCT of Delhi')).toBe('Delhi');
    expect(matchStateName('Daman & Diu')).toBe('Dadra and Nagar Haveli and Daman and Diu');
  });
  it('returns null for unknown or empty names', () => {
    expect(matchStateName('Atlantis')).toBeNull();
    expect(matchStateName(null)).toBeNull();
    expect(matchStateName('')).toBeNull();
  });
});

describe('placePatch', () => {
  const empty = { city: '', state: '' };
  it('fills empty fields', () => {
    expect(placePatch(empty, {}, { state: 'Kerala', city: 'Kochi' })).toEqual({ state: 'Kerala', city: 'Kochi' });
  });
  it('never overwrites what the person typed', () => {
    expect(placePatch({ city: 'My Town', state: 'Goa' }, {}, { state: 'Kerala', city: 'Kochi' })).toEqual({});
  });
  it('replaces its own earlier fill when the PIN changes', () => {
    const filled = { city: 'Kochi', state: 'Kerala' };
    expect(placePatch(filled, filled, { state: 'Karnataka', city: 'Bengaluru' })).toEqual({ state: 'Karnataka', city: 'Bengaluru' });
  });
  it('ignores unknown states and blank cities', () => {
    expect(placePatch(empty, {}, { state: 'Nowhere', city: '  ' })).toEqual({});
  });
  it('does nothing when the field already has the value', () => {
    expect(placePatch({ city: 'Kochi', state: 'Kerala' }, {}, { state: 'Kerala', city: 'Kochi' })).toEqual({});
  });
});
