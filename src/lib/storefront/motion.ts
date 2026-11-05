/** Shared motion helpers (CSS tokens live in src/index.css). All of them are no-ops under reduced motion. */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Flies a small brass dot from `from` to the header cart icon (transform/opacity only, 600 ms,
 * removed on finish). Purely decorative: the cart state and toast do not wait for it.
 */
export function flyToCart(from: Element | null) {
  const target = document.querySelector('[data-cart-icon]');
  if (!from || !target || prefersReducedMotion() || typeof Element.prototype.animate !== 'function') return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  Object.assign(dot.style, {
    position: 'fixed', left: `${a.left + a.width / 2 - 9}px`, top: `${a.top + a.height / 2 - 9}px`, width: '18px', height: '18px',
    borderRadius: '9999px', background: 'linear-gradient(135deg,#E9CB85,#B08A3E)', boxShadow: '0 4px 10px rgba(0,0,0,.3)',
    zIndex: '60', pointerEvents: 'none',
  });
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = dot.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px,${dy * 0.6 - 40}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0.2 },
    ],
    { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}
