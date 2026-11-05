import { SITE_NAME, SITE_TAGLINE, SITE_URL, absoluteUrl } from "./siteConfig";
import type { JsonLd } from "./useSeo";

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/favicon.png"),
    description: SITE_TAGLINE,
    areaServed: "IN",
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

interface ProductLike {
  slug: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  trackInventory?: boolean;
  imageUrl?: string;
}

export function productJsonLd(product: ProductLike): JsonLd {
  const inStock = product.trackInventory === false || product.stock > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.imageUrl ? [absoluteUrl(product.imageUrl)] : undefined,
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: "INR",
      price: product.price,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

export function itemListJsonLd(items: Array<{ slug: string; name: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/product/${item.slug}`),
      name: item.name,
    })),
  };
}
