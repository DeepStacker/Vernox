/** Indian shipping-address validation shared by checkout and the account profile. */

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

/** Strips an optional +91 / 0 prefix and separators, returning the 10 digits or null. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^(\+?91|0)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function isValidPincode(input: string): boolean {
  return /^[1-9]\d{5}$/.test(input.trim());
}

export interface AddressForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export type AddressErrors = Partial<Record<keyof AddressForm, string>>;

export function validateAddress(form: AddressForm): AddressErrors {
  const errors: AddressErrors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter the recipient name.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (!normalizeIndianMobile(form.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (form.address.trim().length < 5) errors.address = 'Enter the full street address.';
  if (form.city.trim().length < 2) errors.city = 'Enter the city.';
  if (!(INDIAN_STATES_AND_UTS as readonly string[]).includes(form.state)) errors.state = 'Select a state or union territory.';
  if (!isValidPincode(form.pincode)) errors.pincode = 'Enter a valid 6-digit pincode.';
  return errors;
}
