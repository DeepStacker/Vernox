/**
 * Public contact details. Values come from `settings/store` when the owner sets them
 * (supportEmail, supportPhone, whatsappNumber, supportHours, workshopAddress); until then the
 * field is an empty string and the UI omits it, so customers never see a placeholder.
 * TODO(contact): owner to fill the settings/store contact fields before launch.
 */
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

export function resolveContact(config: StoreConfig): StoreContact {
  const c = config as StoreConfig & ContactSettings;
  return {
    email: c.supportEmail || config.adminEmail || '',
    phone: c.supportPhone || '',
    whatsapp: (c.whatsappNumber ?? '').replace(/\D/g, ''),
    hours: c.supportHours || 'Mon to Sat, 10 am to 6 pm IST',
    address: c.workshopAddress || '',
  };
}

export const whatsappLink = (contact: StoreContact, text: string) =>
  contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}` : null;

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
