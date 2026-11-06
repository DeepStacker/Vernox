/**
 * Public contact details. Values come from `settings/store` when the owner sets them
 * (supportEmail, supportPhone, whatsappNumber, supportHours, workshopAddress); until then the
 * field is empty or a seeded placeholder (PLACEHOLDER_CONTACT) and the UI omits it, so customers never see one.
 * The admin home's launch checklist lists what is still to fill in.
 */
import { isPlaceholderValue } from '@/types/settings';
import type { StoreConfig } from '@/types/store';

export interface StoreContact {
  /** Empty when the owner has not configured it; callers must omit empty fields. */
  email: string;
  phone: string;
  /** Digits only with country code, e.g. 919876543210, for wa.me links. Empty until configured. */
  whatsapp: string;
  hours: string;
  address: string;
}

type ContactSettings = Partial<{
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  supportHours: string;
  workshopAddress: string;
}>;

/** Seeded placeholder values count as unset, so customers never see them. */
export const publicValue = (value: string | undefined | null): string => (value && !isPlaceholderValue(value) ? value : '');

export function resolveContact(config: StoreConfig): StoreContact {
  const c = config as StoreConfig & ContactSettings;
  return {
    email: publicValue(c.supportEmail) || config.adminEmail || '',
    phone: publicValue(c.supportPhone),
    whatsapp: publicValue(c.whatsappNumber).replace(/\D/g, ''),
    hours: c.supportHours || 'Mon to Sat, 10 am to 6 pm IST',
    address: publicValue(c.workshopAddress),
  };
}

export const whatsappLink = (contact: StoreContact, text: string) =>
  contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}` : null;

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
