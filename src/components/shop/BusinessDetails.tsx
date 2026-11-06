import { useCatalog } from '@/lib/catalogContext';
import { publicValue, resolveContact } from '@/lib/storefront/contact';
import { isPlaceholderSeller } from '@/types/settings';

/**
 * Seller identity and grievance officer, as the Consumer Protection (E-Commerce) Rules, 2020 and the
 * DPDP Act, 2023 require on the storefront. Values come from `settings/store` (seller block and
 * grievanceOfficer* fields); unset and placeholder fields are omitted so customers never see them.
 */
export function BusinessDetails() {
  const { storeConfig } = useCatalog();
  // Placeholder seller details (UAT) are hidden as a whole: a partial fake identity is worse than none.
  const seller = isPlaceholderSeller(storeConfig.seller) ? {} : storeConfig.seller ?? {};
  const contact = resolveContact(storeConfig);
  const address = [seller.address, seller.city, seller.state, seller.pincode].filter(Boolean).join(', ');
  const officerEmail = publicValue(storeConfig.grievanceOfficerEmail) || contact.email;
  const rows: Array<[string, string]> = [
    ['Seller', seller.legalName || seller.tradeName || storeConfig.storeName],
    ['Registered address', address],
    ['GSTIN', seller.gstin ?? ''],
    ['Grievance officer', [publicValue(storeConfig.grievanceOfficerName), officerEmail, contact.phone].filter(Boolean).join(' · ')],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.filter(([, value]) => value).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold text-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
