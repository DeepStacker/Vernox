import { Link } from 'react-router-dom';
import { StoreLayout } from '@/components/shop/StoreLayout';
import { useSeo } from '@/lib/seo';

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <StoreLayout>
      <div className="container py-20 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl">Page not found</h1>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/shop" className="btn-primary">Shop designs</Link>
          <Link to="/" className="btn-secondary">Home</Link>
        </div>
      </div>
    </StoreLayout>
  );
}
