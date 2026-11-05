/**
 * Public contact details. Values come from `settings/store` when the owner sets them
 * (supportEmail, supportPhone, whatsappNumber, supportHours, workshopAddress); until then clearly
 * marked placeholders are shown so nothing fake is presented as real.
 * TODO(contact): owner to fill the settings/store contact fields before launch.
 */
import type { StoreConfig } from '@/types/store';

export interface StoreContact {
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
    email: c.supportEmail || config.adminEmail || '[Support email]',
    phone: c.supportPhone || '[Support phone]',
    whatsapp: (c.whatsappNumber ?? '').replace(/\D/g, ''),
    hours: c.supportHours || 'Mon to Sat, 10 am to 6 pm IST',
    address: c.workshopAddress || '[Workshop address]',
  };
}

export const whatsappLink = (contact: StoreContact, text: string) =>
  contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}` : null;

export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
