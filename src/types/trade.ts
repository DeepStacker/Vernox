/**
 * Trade / bulk enquiry vocabulary shared by the API (api/_lib/tradeEnquiry.ts) and the Trade page, so
 * the form can only offer values the server accepts.
 */
export const TRADE_PROJECT_TYPES = [
  { id: 'corporate-signage', label: 'Logo signage' },
  { id: 'corporate-gifting', label: 'Corporate gifting' },
  { id: 'interior-design', label: 'Architect or interior designer' },
  { id: 'hospitality', label: 'Hotel, restaurant or cafe' },
  { id: 'other', label: 'Something else' },
] as const;
export const TRADE_VOLUMES = ['1-10', '10-25', '25-50', '50-100', '100+'] as const;
export const TRADE_TIMELINES = ['Under 2 weeks', '2-4 weeks', '1-2 months', 'Flexible'] as const;
export const TRADE_FINISHES = [
  { id: 'black_patina', label: 'Black powder coat' }, { id: 'brass', label: 'Brass' }, { id: 'gold', label: 'Gold' },
  { id: 'copper', label: 'Copper' }, { id: 'stainless', label: 'Stainless steel' }, { id: 'corten_rust', label: 'Corten rust' },
] as const;

type Ids<T extends readonly { id: string }[]> = { [K in keyof T]: T[K]['id'] };
const ids = <T extends readonly { id: string }[]>(list: T) => list.map(x => x.id) as unknown as Ids<T>;
export const TRADE_PROJECT_TYPE_IDS = ids(TRADE_PROJECT_TYPES);
export const TRADE_FINISH_IDS = ids(TRADE_FINISHES);
