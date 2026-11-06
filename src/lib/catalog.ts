/**
 * Catalogue types, taxonomy and the SAMPLE seed catalogue.
 *
 * The storefront reads products from Firestore (src/lib/data/products.ts). The `products`
 * array below is SEED DATA only: scripts/seed-firestore.ts writes it. Every item is flagged `isSample: true` until
 * the owner replaces it with real products, prices and photography.
 *
 * Pricing contract with the server (api/_lib/pricing.ts): the unit price is
 * `price + sizes[i].priceDelta` (rupees, excluding GST); `finishes` are normalised ids that must
 * match what the customer picks; finish does not change catalogue prices.
 */
import { shapeDefinitions } from './shapes';

export type ProductCategory =
  | 'spiritual' | 'nature' | 'geometric' | 'wildlife' | 'cities' | 'nameplates' | 'office' | 'festive'
  // Legacy ids kept so existing Firestore documents and admin forms stay valid.
  | 'wall-art' | 'sculptures' | 'showpieces' | 'statement' | 'frames' | 'monograms' | 'silhouettes' | 'quotes';

export type FinishId =
  | 'black_patina' | 'brass' | 'antique_brass' | 'gold' | 'copper' | 'corten_rust' | 'stainless' | 'brushed_hairline'
  // Legacy ids.
  | 'steel' | 'corten';

export type RoomId = 'living' | 'bedroom' | 'pooja' | 'entrance' | 'office' | 'outdoor' | 'kids';
export type ThemeId = 'spiritual' | 'nature' | 'abstract' | 'wildlife' | 'cities' | 'typography' | 'festive' | 'minimal';

export interface ProductSize {
  label: string;
  widthMm: number;
  heightMm: number;
  priceDelta: number;
}

export interface ProductFaq {
  q: string;
  a: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: ProductCategory;
  /** Base price in rupees, excluding GST, for the first (smallest) size. */
  price: number;
  shapeId: string; // references shapeDefinitions
  finishes: FinishId[];
  sizes: ProductSize[];
  stock: number;
  trackInventory?: boolean;
  featured?: boolean;
  bestseller?: boolean;
  isNew?: boolean;
  customizable?: boolean;
  imageUrl?: string;
  lifestyleImage?: string;
  alloySpec?: string;
  /** Sample/placeholder data flag; admin shows a note, the storefront renders normally. */
  isSample?: boolean;
  /** Strike-through list price (rupees, excl. GST) for the first size; larger sizes scale proportionally. */
  mrp?: number;
  leadTimeDays?: number;
  hsnCode?: string;
  rooms?: RoomId[];
  themes?: ThemeId[];
  material?: string;
  thicknessMm?: number;
  mounting?: string;
  weightKg?: number;
  indoorOutdoor?: 'indoor' | 'outdoor' | 'both';
  /** Epoch ms; drives the "Newest" sort. */
  createdAt?: number;
  faqs?: ProductFaq[];
}

// ---------- Taxonomy ----------

export const categories: { id: ProductCategory; name: string; description: string }[] = [
  { id: 'spiritual', name: 'Spiritual & Mandala', description: 'Om, Ganesha, Buddha, mandalas and the Tree of Life for pooja rooms and calm corners' },
  { id: 'nature', name: 'Nature & Botanical', description: 'Leaves, branches and florals cut in metal' },
  { id: 'geometric', name: 'Abstract & Geometric', description: 'Modern patterns and bold shapes for living rooms' },
  { id: 'wildlife', name: 'Wildlife & Birds', description: 'Peacocks, tigers, elephants and birds in flight' },
  { id: 'cities', name: 'City Skylines & Maps', description: 'Indian city skylines and India maps' },
  { id: 'nameplates', name: 'Name Plates & House Signs', description: 'Customisable name plates for homes and villas' },
  { id: 'office', name: 'Office & Corporate', description: 'Logos, quotes and reception wall art' },
  { id: 'festive', name: 'Festive & Gifting', description: 'Diwali, housewarming and wedding gifts' },
];

export const ROOMS: { id: RoomId; name: string; blurb: string }[] = [
  { id: 'living', name: 'Living Room', blurb: 'Statement pieces above the sofa' },
  { id: 'bedroom', name: 'Bedroom', blurb: 'Calm art behind the bed' },
  { id: 'pooja', name: 'Pooja Room', blurb: 'Sacred symbols in metal' },
  { id: 'entrance', name: 'Entrance & Foyer', blurb: 'A first impression for guests' },
  { id: 'office', name: 'Office', blurb: 'Reception and workspace walls' },
  { id: 'outdoor', name: 'Balcony & Outdoor', blurb: 'Rust-resistant finishes for open air' },
  { id: 'kids', name: 'Kids Room', blurb: 'Playful shapes and animals' },
];

export const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'spiritual', name: 'Spiritual' },
  { id: 'nature', name: 'Nature' },
  { id: 'abstract', name: 'Abstract' },
  { id: 'wildlife', name: 'Wildlife' },
  { id: 'cities', name: 'Cities & Maps' },
  { id: 'typography', name: 'Names & Quotes' },
  { id: 'festive', name: 'Festive' },
  { id: 'minimal', name: 'Minimal' },
];

export const finishLabels: Record<string, { name: string; swatch: string }> = {
  black_patina: { name: 'Black Powder Coat', swatch: 'linear-gradient(135deg,#3a3a3a,#111)' },
  steel: { name: 'Black Steel', swatch: 'linear-gradient(135deg,#3a3a3a,#111)' },
  stainless: { name: 'Stainless Steel', swatch: 'linear-gradient(135deg,#e2e2e2,#8a8a8a)' },
  brushed_hairline: { name: 'Brushed Hairline', swatch: 'linear-gradient(135deg,#d8d8d8,#8a8a8a)' },
  brass: { name: 'Brass', swatch: 'linear-gradient(135deg,#e6c069,#8a6a2a)' },
  antique_brass: { name: 'Antique Brass', swatch: 'linear-gradient(135deg,#b8934a,#5e4416)' },
  copper: { name: 'Copper', swatch: 'linear-gradient(135deg,#e08a5a,#7a3a1e)' },
  gold: { name: 'Gold', swatch: 'linear-gradient(135deg,#f5d97a,#a37c22)' },
  corten_rust: { name: 'Corten Rust', swatch: 'linear-gradient(135deg,#c05a2a,#5a2010)' },
  corten: { name: 'Corten Rust', swatch: 'linear-gradient(135deg,#c05a2a,#5a2010)' },
};

export const finishName = (id: string) => finishLabels[id]?.name ?? id.replace(/_/g, ' ');

// ---------- Display helpers (shared by cards, PDP and cart) ----------

export const mmToCm = (mm: number) => Math.round(mm / 10);
export const mmToInches = (mm: number) => Math.round(mm / 25.4);
export const formatSizeCm = (s: Pick<ProductSize, 'widthMm' | 'heightMm'>) => `${mmToCm(s.widthMm)} × ${mmToCm(s.heightMm)} cm`;
export const formatSizeInches = (s: Pick<ProductSize, 'widthMm' | 'heightMm'>) => `${mmToInches(s.widthMm)} × ${mmToInches(s.heightMm)} in`;

/** Unit price the server will charge before GST. */
export const unitPrice = (p: Pick<Product, 'price'>, size?: Pick<ProductSize, 'priceDelta'>) => p.price + (size?.priceDelta ?? 0);

/** MRP for a size; scales with the price so the discount percentage is the same across sizes. */
export function mrpFor(p: Pick<Product, 'price' | 'mrp'>, size?: Pick<ProductSize, 'priceDelta'>): number | null {
  if (!p.mrp || p.mrp <= p.price || p.price <= 0) return null;
  return Math.round((unitPrice(p, size) * p.mrp) / p.price);
}

export function discountPercent(p: Pick<Product, 'price' | 'mrp'>): number {
  if (!p.mrp || p.mrp <= p.price) return 0;
  return Math.round((1 - p.price / p.mrp) * 100);
}

/** Lowest price across sizes (the "From" price on listings). */
export const fromPrice = (p: Pick<Product, 'price' | 'sizes'>) =>
  Math.min(p.price, ...p.sizes.map(s => p.price + s.priceDelta));

// ---------- Sample catalogue ----------

const pickShape = (id: string) => shapeDefinitions.find(s => s.id === id)?.id ?? 'circle';

/** Charm pricing: round to the nearest hundred, then end in 99 (e.g. 4,299 -> 4,299, 4,310 -> 4,299). */
const charm = (n: number) => Math.max(99, Math.round(n / 100) * 100 - 1);

type SizeSetId = 'square' | 'landscape' | 'portrait' | 'plaque';
const SIZE_DIMS: Record<SizeSetId, Array<[number, number]>> = {
  square: [[45, 45], [60, 60], [90, 90]],
  landscape: [[60, 40], [90, 60], [120, 60]],
  portrait: [[40, 60], [60, 90], [60, 120]],
  plaque: [[30, 15], [45, 20], [60, 25]],
};

/** Sizes priced by plate area against the smallest size (area^0.85), so larger pieces cost more but not linearly. */
function buildSizes(set: SizeSetId, base: number): ProductSize[] {
  const dims = SIZE_DIMS[set];
  const baseArea = dims[0][0] * dims[0][1];
  return dims.map(([w, h]) => ({
    label: `${w} × ${h} cm`,
    widthMm: w * 10,
    heightMm: h * 10,
    priceDelta: charm(base * Math.pow((w * h) / baseArea, 0.85)) - base,
  }));
}

interface Seed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: ProductCategory;
  base: number;
  mrpFactor: number;
  shape: string;
  sizeSet: SizeSetId;
  finishes: FinishId[];
  rooms: RoomId[];
  themes: ThemeId[];
  tags?: Array<'bestseller' | 'featured' | 'new' | 'customizable'>;
  thicknessMm?: 1.5 | 2;
  outdoor?: boolean;
  lead?: number;
}

const METAL_FINISHES: FinishId[] = ['black_patina', 'brass', 'gold', 'copper'];
const OUTDOOR_FINISHES: FinishId[] = ['black_patina', 'corten_rust', 'stainless'];

const SEEDS: Seed[] = [
  // Spiritual & Mandala
  { slug: 'om-symbol-wall-art', name: 'Om Symbol Wall Art', tagline: 'A calm Om for the pooja room or entrance', description: 'The Om symbol laser-cut from a single metal sheet and finished in your choice of metal tone. Hangs on standoff spacers so it throws a soft shadow on the wall.', category: 'spiritual', base: 2499, mrpFactor: 1.4, shape: 'circle', sizeSet: 'square', finishes: [...METAL_FINISHES, 'antique_brass'], rooms: ['pooja', 'entrance', 'living'], themes: ['spiritual', 'minimal'], tags: ['bestseller', 'featured'], lead: 5 },
  { slug: 'ganesha-line-art', name: 'Ganesha Line Art', tagline: 'Lord Ganesha in a single flowing line', description: 'A fine-line Ganesha cut-out for housewarmings and new beginnings. Detailed cuts are kept wide enough to stay strong and easy to clean.', category: 'spiritual', base: 3299, mrpFactor: 1.45, shape: 'shield', sizeSet: 'portrait', finishes: ['black_patina', 'brass', 'gold', 'copper'], rooms: ['pooja', 'living', 'entrance'], themes: ['spiritual', 'festive'], tags: ['bestseller', 'featured'], lead: 6 },
  { slug: 'sitting-buddha-silhouette', name: 'Sitting Buddha Silhouette', tagline: 'Meditative Buddha with halo', description: 'A seated Buddha silhouette with a circular halo. A quiet focal point for a bedroom, study or meditation corner.', category: 'spiritual', base: 3499, mrpFactor: 1.4, shape: 'circle', sizeSet: 'square', finishes: ['black_patina', 'brass', 'antique_brass', 'gold'], rooms: ['bedroom', 'living', 'pooja'], themes: ['spiritual', 'minimal'], lead: 6 },
  { slug: 'lotus-mandala-round', name: 'Lotus Mandala Round', tagline: 'Layered lotus mandala in a round plate', description: 'An intricate lotus mandala with petal layers cut from 1.5 mm sheet. Looks best lit from the side with a wall light.', category: 'spiritual', base: 3799, mrpFactor: 1.4, shape: 'flower', sizeSet: 'square', finishes: METAL_FINISHES, rooms: ['living', 'bedroom', 'pooja'], themes: ['spiritual', 'abstract'], tags: ['featured'], lead: 7 },
  { slug: 'tree-of-life', name: 'Tree of Life', tagline: 'Branches and roots in one circle', description: 'The Tree of Life, a favourite for living room walls and housewarming gifts. Branches reach out in an open design that lets the wall colour show through.', category: 'spiritual', base: 4299, mrpFactor: 1.45, shape: 'leaf', sizeSet: 'square', finishes: [...METAL_FINISHES, 'antique_brass'], rooms: ['living', 'entrance', 'bedroom'], themes: ['spiritual', 'nature'], tags: ['bestseller', 'featured'], lead: 7 },
  // Nature & Botanical
  { slug: 'monstera-leaf-trio', name: 'Monstera Leaf Trio', tagline: 'Three leaves, three sizes', description: 'Three monstera leaves cut from 1.5 mm sheet and sold as a set. Arrange them on a diagonal or in a row.', category: 'nature', base: 3999, mrpFactor: 1.4, shape: 'leaf', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'gold', 'copper'], rooms: ['living', 'bedroom'], themes: ['nature', 'minimal'], tags: ['new'], lead: 6 },
  { slug: 'banyan-branch-panel', name: 'Banyan Branch Panel', tagline: 'A sweeping branch across the wall', description: 'A long branch with leaves in flowing lines, made for wide walls behind sofas and beds.', category: 'nature', base: 4799, mrpFactor: 1.4, shape: 'wave', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'copper', 'corten_rust'], rooms: ['living', 'bedroom', 'entrance'], themes: ['nature'], lead: 7 },
  { slug: 'cherry-blossom-branch', name: 'Cherry Blossom Branch', tagline: 'Delicate blossoms on a slim branch', description: 'Blossoms and buds on a slim branch, cut from thin sheet and finished by hand.', category: 'nature', base: 3599, mrpFactor: 1.4, shape: 'flower', sizeSet: 'portrait', finishes: ['black_patina', 'gold', 'copper', 'brass'], rooms: ['bedroom', 'living'], themes: ['nature', 'minimal'], lead: 6 },
  { slug: 'outdoor-corten-fern', name: 'Corten Fern Panel (Outdoor)', tagline: 'Rust-finish fern for balcony and garden walls', description: 'A fern panel in a Corten rust finish with a protective clear coat for balconies, garden walls and covered patios. It keeps its colour outdoors.', category: 'nature', base: 5499, mrpFactor: 1.35, shape: 'leaf', sizeSet: 'portrait', finishes: OUTDOOR_FINISHES, rooms: ['outdoor', 'entrance'], themes: ['nature'], outdoor: true, thicknessMm: 2, lead: 8 },
  // Abstract & Geometric
  { slug: 'hexagon-honeycomb-set', name: 'Hexagon Honeycomb Set', tagline: 'Modular hexagons for a feature wall', description: 'A honeycomb of cut-out hexagons that you can arrange in your own layout. A modern look for an accent wall.', category: 'geometric', base: 4499, mrpFactor: 1.4, shape: 'hexagon', sizeSet: 'landscape', finishes: METAL_FINISHES, rooms: ['living', 'office'], themes: ['abstract', 'minimal'], tags: ['bestseller'], lead: 6 },
  { slug: 'concentric-rings-art', name: 'Concentric Rings', tagline: 'Rings that catch the light', description: 'Layered rings with open gaps, mounted away from the wall so the shadows move through the day.', category: 'geometric', base: 3299, mrpFactor: 1.4, shape: 'circle', sizeSet: 'square', finishes: ['black_patina', 'brass', 'gold', 'stainless'], rooms: ['living', 'office', 'bedroom'], themes: ['abstract', 'minimal'], tags: ['featured'], lead: 5 },
  { slug: 'sunburst-radiance', name: 'Sunburst Radiance', tagline: 'Sunrays in a bold round', description: 'A sunburst that works over a sofa, a console or a dining wall. Cut from 2 mm sheet for a sharp, solid feel.', category: 'geometric', base: 5299, mrpFactor: 1.4, shape: 'starburst', sizeSet: 'square', finishes: ['brass', 'gold', 'copper', 'black_patina'], rooms: ['living', 'entrance'], themes: ['abstract'], thicknessMm: 2, tags: ['bestseller', 'featured'], lead: 7 },
  { slug: 'arches-and-lines', name: 'Arches and Lines', tagline: 'Three arches, one calm composition', description: 'Abstract arches in a vertical layout, inspired by modern Indian homes. A quiet piece for a foyer or hallway.', category: 'geometric', base: 3999, mrpFactor: 1.4, shape: 'oval', sizeSet: 'portrait', finishes: ['black_patina', 'brass', 'gold', 'stainless'], rooms: ['entrance', 'living', 'bedroom'], themes: ['abstract', 'minimal'], tags: ['new'], lead: 6 },
  // Wildlife & Birds
  { slug: 'peacock-feather-fan', name: 'Peacock in Full Plume', tagline: 'The national bird in full display', description: 'A peacock with its tail fanned out, cut with fine feather detail. A favourite for living rooms and festive gifting.', category: 'wildlife', base: 4999, mrpFactor: 1.45, shape: 'cloud', sizeSet: 'landscape', finishes: ['brass', 'gold', 'copper', 'black_patina'], rooms: ['living', 'entrance'], themes: ['wildlife', 'nature'], tags: ['bestseller', 'featured'], lead: 8 },
  { slug: 'royal-bengal-tiger', name: 'Royal Bengal Tiger', tagline: 'A tiger in strong, simple lines', description: 'A tiger portrait in bold cuts. Strong enough for a statement wall in a study or office.', category: 'wildlife', base: 5799, mrpFactor: 1.4, shape: 'shield', sizeSet: 'landscape', finishes: ['black_patina', 'copper', 'corten_rust', 'brass'], rooms: ['living', 'office'], themes: ['wildlife'], lead: 8 },
  { slug: 'elephant-family', name: 'Elephant Family', tagline: 'A mother and calf walking together', description: 'An elephant and her calf in a friendly, simple style. Popular for kids rooms and nursery walls.', category: 'wildlife', base: 3799, mrpFactor: 1.4, shape: 'cloud', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'copper', 'gold'], rooms: ['kids', 'living', 'bedroom'], themes: ['wildlife'], tags: ['new'], lead: 6 },
  { slug: 'birds-in-flight', name: 'Birds in Flight', tagline: 'A flock rising across the wall', description: 'A flock of birds in flight, laser-cut and mounted individually. Place them in your own pattern.', category: 'wildlife', base: 3299, mrpFactor: 1.4, shape: 'wave', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'gold', 'copper'], rooms: ['living', 'bedroom', 'kids'], themes: ['wildlife', 'minimal'], lead: 6 },
  // City Skylines & Maps
  { slug: 'mumbai-skyline', name: 'Mumbai Skyline', tagline: 'Gateway, Sea Link and the Marine Drive curve', description: 'The Mumbai skyline cut in a long panel. A thoughtful gift for people who love the city or have moved away from it.', category: 'cities', base: 4299, mrpFactor: 1.4, shape: 'rectangle', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'stainless', 'copper'], rooms: ['living', 'office'], themes: ['cities'], lead: 7 },
  { slug: 'delhi-skyline', name: 'Delhi Skyline', tagline: 'India Gate, Humayun\'s Tomb and Qutub Minar', description: 'Delhi landmarks in one skyline panel, laser-cut from sheet metal.', category: 'cities', base: 4299, mrpFactor: 1.4, shape: 'rectangle', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'stainless', 'copper'], rooms: ['living', 'office'], themes: ['cities'], lead: 7 },
  { slug: 'india-map-wall-art', name: 'India Map Wall Art', tagline: 'India map with state outlines', description: 'India with state boundaries cut out. Popular for offices, schools and homes of NRIs.', category: 'cities', base: 5999, mrpFactor: 1.4, shape: 'diamond', sizeSet: 'portrait', finishes: ['black_patina', 'brass', 'gold', 'stainless'], rooms: ['office', 'living'], themes: ['cities'], tags: ['featured'], lead: 8 },
  // Name Plates & House Signs
  { slug: 'custom-family-name-plate', name: 'Custom Family Name Plate', tagline: 'Your family name, cut to order', description: 'A name plate with your family name and house number, cut to the font and size you choose in the studio. Weather-ready finishes for the main gate.', category: 'nameplates', base: 2499, mrpFactor: 1.4, shape: 'plaque', sizeSet: 'plaque', finishes: ['black_patina', 'brass', 'stainless', 'corten_rust'], rooms: ['entrance', 'outdoor'], themes: ['typography'], tags: ['bestseller', 'customizable', 'featured'], outdoor: true, lead: 7 },
  { slug: 'villa-house-sign-address', name: 'Villa House Sign with Address', tagline: 'Name, address and a motif', description: 'A larger house sign with your name, address and a motif of your choice. Built to hold up to sun and rain.', category: 'nameplates', base: 3799, mrpFactor: 1.4, shape: 'plaque', sizeSet: 'plaque', finishes: ['black_patina', 'stainless', 'corten_rust', 'brass'], rooms: ['entrance', 'outdoor'], themes: ['typography'], tags: ['customizable'], outdoor: true, thicknessMm: 2, lead: 8 },
  // Office & Corporate
  { slug: 'company-logo-wall-sign', name: 'Company Logo Wall Sign', tagline: 'Your logo in metal for reception', description: 'Your company logo laser-cut in metal for reception walls. Send us your file; we cut it to the size you pick. Ask for bulk pricing on the Corporate page.', category: 'office', base: 5999, mrpFactor: 1.35, shape: 'badge', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'gold', 'stainless'], rooms: ['office'], themes: ['typography', 'minimal'], tags: ['customizable'], thicknessMm: 2, lead: 9 },
  { slug: 'motivational-quote-panel', name: 'Motivational Quote Panel', tagline: 'Words that keep the team going', description: 'A quote of your choice in clean letters on a metal panel. Good for workspaces, studios and shops.', category: 'office', base: 3499, mrpFactor: 1.4, shape: 'rectangle', sizeSet: 'landscape', finishes: ['black_patina', 'brass', 'gold', 'stainless'], rooms: ['office', 'living'], themes: ['typography', 'minimal'], tags: ['customizable'], lead: 7 },
  // Festive & Gifting
  { slug: 'diwali-diya-wall-hanging', name: 'Diwali Diya Wall Hanging', tagline: 'A festive diya for the entrance wall', description: 'A diya and rangoli-inspired wall hanging, a warm festive gift that stays up long after Diwali.', category: 'festive', base: 2699, mrpFactor: 1.4, shape: 'starburst', sizeSet: 'square', finishes: ['brass', 'gold', 'copper', 'black_patina'], rooms: ['entrance', 'pooja', 'living'], themes: ['festive', 'spiritual'], tags: ['bestseller', 'new'], lead: 5 },
  { slug: 'housewarming-welcome-plaque', name: 'Housewarming Welcome Plaque', tagline: 'Gift a new home a metal welcome', description: 'A welcome plaque with a name and a short wish, wrapped in a gift box. Add a personal message at checkout.', category: 'festive', base: 2499, mrpFactor: 1.4, shape: 'plaque', sizeSet: 'plaque', finishes: ['black_patina', 'brass', 'gold', 'copper'], rooms: ['entrance', 'living'], themes: ['festive', 'typography'], tags: ['customizable', 'featured'], lead: 6 },
];

const SAMPLE_CREATED_AT = Date.UTC(2026, 9, 1);

const buildProduct = (s: Seed, index: number): Product => {
  const thickness = s.thicknessMm ?? 1.5;
  const sizes = buildSizes(s.sizeSet, s.base);
  const biggest = sizes[sizes.length - 1];
  const isOutdoor = !!s.outdoor;
  return {
    id: `vx-${String(index + 1).padStart(3, '0')}`,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    category: s.category,
    price: s.base,
    mrp: charm(s.base * s.mrpFactor),
    shapeId: pickShape(s.shape),
    finishes: s.finishes,
    sizes,
    stock: 25,
    trackInventory: true,
    featured: s.tags?.includes('featured'),
    bestseller: s.tags?.includes('bestseller'),
    isNew: s.tags?.includes('new'),
    customizable: s.tags?.includes('customizable') || undefined,
    isSample: true,
    leadTimeDays: s.lead ?? 7,
    hsnCode: '830629', // other ornaments of base metal (5%); see ROADMAP "Business and tax decisions"
    rooms: s.rooms,
    themes: s.themes,
    material: isOutdoor ? `${thickness} mm weather-grade steel` : `${thickness} mm mild steel sheet`,
    thicknessMm: thickness,
    mounting: 'Standoff spacers, 2.5 cm off the wall (fittings included)',
    // Steel density ~7.85 g/cm3 on a ~35% cut-out fill of the bounding box; sample estimate.
    weightKg: Math.round(((biggest.widthMm / 10) * (biggest.heightMm / 10) * (thickness / 10) * 7.85 * 0.35) / 100) / 10,
    indoorOutdoor: isOutdoor ? 'both' : 'indoor',
    createdAt: SAMPLE_CREATED_AT - index * 86_400_000,
    alloySpec: `${thickness} mm ${isOutdoor ? 'weather-grade steel' : 'mild steel'} · laser cut`,
    // TODO(catalogue): replace the rendered previews with real product photography
    // (set `imageUrl` and `lifestyleImage`); until then the storefront draws each design from `shapeId`.
  };
};

export const products: Product[] = SEEDS.map(buildProduct);

export const getProduct = (slug: string) => products.find(p => p.slug === slug);
export const getCategory = (id: ProductCategory) => categories.find(c => c.id === id);
