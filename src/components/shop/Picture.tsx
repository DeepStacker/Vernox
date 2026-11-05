import type { ImgHTMLAttributes } from 'react';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'loading'> {
  /** Path of the .jpg under /public; a sibling .webp of the same name is offered first. */
  src: string;
  width: number;
  height: number;
  /** Above-the-fold hero/LCP image: eager load with high fetch priority. */
  priority?: boolean;
}

/** Responsive-format image: WebP with JPG fallback, explicit dimensions to avoid layout shift. */
export function Picture({ src, width, height, priority = false, alt, className, ...rest }: Props) {
  const webp = src.replace(/\.jpe?g$/i, '.webp');
  return (
    <picture>
      {webp !== src && <source srcSet={webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        className={className}
        {...rest}
      />
    </picture>
  );
}

/** Room and workshop photos shipped in /public/images (dimensions of the JPG originals). */
export const SITE_IMAGES = {
  livingRoom: { src: '/images/hero-art-lounge.jpg', width: 1200, height: 896 },
  penthouse: { src: '/images/hero-penthouse-brass.jpg', width: 1376, height: 768 },
  bedroom: { src: '/images/space-bedroom.jpg', width: 1200, height: 896 },
  office: { src: '/images/office-decor.jpg', width: 1200, height: 896 },
  entrance: { src: '/images/installation-corten.jpg', width: 1200, height: 896 },
  round: { src: '/images/installation-round.jpg', width: 1200, height: 896 },
  workshop: { src: '/images/artisan-workshop.jpg', width: 1200, height: 896 },
} as const;
