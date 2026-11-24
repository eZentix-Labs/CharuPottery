import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiArrowRight, FiChevronLeft, FiChevronRight, FiCopy, FiInstagram } from 'react-icons/fi';
import api from '../api/axios';
import ProductCard from '../components/product/ProductCard';
import useReveal from '../hooks/useReveal';
import { formatPaise } from '../utils/money';
import useMotionPrefs from '../hooks/useMotionPrefs';
import TiltCard from '../components/home/TiltCard';
import Marquee from '../components/home/Marquee';
import PotteryWheel from '../components/home/PotteryWheel';
import ScrollProcess from '../components/home/ScrollProcess';
import Lookbook from '../components/home/Lookbook';
import '../components/home/home-effects.css';
import './HomePage.css';

/* DEVELOPMENT PLACEHOLDER imagery — used only until the admin adds homepage
   banners (Admin → Brand & Banners). Replace with Charu Pottery photography. */
const FALLBACK_SLIDES = [
  { src: 'https://images.unsplash.com/photo-1493106641515-6b5631de4bb9?q=75&w=1800&auto=format&fit=crop', alt: 'Potter shaping clay on the wheel' },
  { src: 'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?q=75&w=1800&auto=format&fit=crop', alt: 'Handmade tableware on a wooden table' },
];
const STORY_IMAGE = 'https://images.unsplash.com/photo-1595351298020-038700609878?q=75&w=1200&auto=format&fit=crop';

const U = (id, w = 1000) => `https://images.unsplash.com/photo-${id}?q=72&w=${w}&auto=format&fit=crop`;

// DEVELOPMENT PLACEHOLDER photos (verified pottery images) — replace with Charu's own.
const PROCESS = [
  { n: '01', title: 'Wedged', text: 'Local clay is kneaded by hand to push out the air and find its rhythm. Every lump starts here.', img: U('1595351298020-038700609878'), alt: 'Clay, tools and glazes on the studio bench' },
  { n: '02', title: 'Thrown', text: 'Each form is pulled up on the wheel, one piece at a time — the potter’s hands decide the shape.', img: U('1493106641515-6b5631de4bb9'), alt: 'Potter shaping clay on the wheel' },
  { n: '03', title: 'Glazed', text: 'We mix glazes in small batches, so the colour of every piece is slightly its own.', img: U('1525974160448-038dacadcc71'), alt: 'Glazed stoneware vase and cups' },
  { n: '04', title: 'Fired', text: 'A long, slow firing in the kiln turns soft clay into stoneware strong enough for daily use.', img: U('1520408222757-6f9f95d87d5d'), alt: 'Group of kiln-fired terracotta vessels' },
];

const RITUALS = [
  { time: '6:30 am', title: 'Morning chai', text: 'A hand-pinched cup that fits your palm, keeps tea warm a little longer and never looks quite like the one next to it.', category: 'Mugs & Cups', img: U('1590422749897-47036da0b0ff'), alt: 'Stack of handmade cream cups' },
  { time: '1:00 pm', title: 'Sunday lunch', text: 'Plates and serving bowls built for dal, sabzi and second helpings — dishwasher-friendly where marked, beautiful always.', category: 'Plates & Dinnerware', img: U('1610701596061-2ecf227e85b2'), alt: 'Handmade tableware set on a wooden table' },
  { time: '5:00 pm', title: 'Green corners', text: 'Breathable terracotta that lets roots stay healthy, in shapes that make a windowsill feel like a garden.', category: 'Planters', img: U('1459411552884-841db9b3cc2a'), alt: 'Cactus in a terracotta pot' },
  { time: '8:00 pm', title: 'Slow evenings', text: 'A single stem in a bud vase. A table set for two. The quiet pieces that make a home feel finished.', category: 'Vases', img: U('1612196808214-b8e1d6145a8c'), alt: 'White ceramic vase on a side table' },
];

const MARQUEE_WORDS = ['Handmade', 'Wheel-thrown', 'Kiln-fired', 'Terracotta', 'Stoneware', 'Small-batch', 'Made in India'];

const PROMISES = ['Handmade in India', 'Small-batch, kiln-fired', 'Cash on Delivery', 'Packed with care'];

const SmartLink = ({ to, className, children, magnetic }) => {
  const extra = magnetic ? { 'data-magnetic': true } : {};
  return to && to.startsWith('/')
    ? <Link to={to} className={className} {...extra}>{children}</Link>
    : <a href={to} className={className} rel="noopener noreferrer" {...extra}>{children}</a>;
};

export default function HomePage() {
  const [featured, setFeatured] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [offers, setOffers] = useState([]);
  const [brand, setBrand] = useState(null);
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const { reducedMotion, finePointer } = useMotionPrefs();
  const heroRef = useRef(null);
  const depthRef = useRef(null);
  const copyRef = useRef(null);

  // Hero depth: the photo drifts slower than the page (parallax) and leans
  // toward the mouse; the headline lifts and fades as you scroll away.
  useEffect(() => {
    if (reducedMotion) return undefined;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const h = heroRef.current?.offsetHeight || 1;
      if (y > h * 1.2) return;
      if (depthRef.current) depthRef.current.style.transform = `translate3d(${mx * -18}px, ${y * 0.28 + my * -12}px, 0)`;
      if (copyRef.current) {
        copyRef.current.style.transform = `translate3d(${mx * 10}px, ${y * -0.12 + my * 6}px, 0)`;
        copyRef.current.style.opacity = String(Math.max(0, 1 - y / (h * 0.7)));
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e) => {
      if (!finePointer) return;
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      schedule();
    };
    window.addEventListener('scroll', schedule, { passive: true });
    const hero = heroRef.current;
    hero?.addEventListener('pointermove', onMove, { passive: true });
    apply();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      hero?.removeEventListener('pointermove', onMove);
    };
  }, [reducedMotion, finePointer]);

  useEffect(() => {
    const load = async () => {
      // Each section loads independently so one failure doesn't blank the page.
      const [featRes, newRes, catRes, banRes, offRes, brandRes] = await Promise.allSettled([
        api.get('/products/featured'),
        api.get('/products/new-arrivals'),
        api.get('/categories'),
        api.get('/content/banners'),
        api.get('/content/offers'),
        api.get('/content/brand'),
      ]);
      const val = (r) => (r.status === 'fulfilled' ? r.value.data.data : null);
      const feat = val(featRes) || [];
      setFeatured(feat.slice(0, 4));
      setNewArrivals((val(newRes) || []).slice(0, 4));
      setCategories(val(catRes) || []);
      setBanners(val(banRes) || []);
      setOffers(val(offRes) || []);
      setBrand(val(brandRes));
      setLoading(false);

      // Testimonials: real, moderated reviews of featured pieces (no invented quotes).
      const reviewSets = await Promise.allSettled(feat.slice(0, 6).map((p) => api.get(`/products/${p._id}/reviews`, { params: { limit: 2 } })));
      const quotes = [];
      reviewSets.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        r.value.data.data.filter((rv) => rv.rating >= 4).forEach((rv) => quotes.push({ ...rv, productName: feat[i].name, productSlug: feat[i].slug }));
      });
      setTestimonials(quotes.slice(0, 3));
    };
    load();
  }, []);

  const slides = banners.length
    ? banners.map((b) => ({ src: b.image?.url, alt: b.image?.altText || b.title, title: b.title, subtitle: b.subtitle, link: b.link, cta: b.ctaLabel }))
    : FALLBACK_SLIDES;
  const count = slides.length;
  const go = useCallback((d) => setSlide((s) => (s + d + count) % count), [count]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (paused || reduce || count < 2) return undefined;
    const t = setInterval(() => go(1), 6500);
    return () => clearInterval(t);
  }, [paused, count, go]);

  useReveal([loading, testimonials.length]);

  const current = slides[slide % count] || {};
  const leadOffer = offers[0];
  const storyText = (brand?.story || '').split(/\n{2,}/)[0]
    || 'Every piece begins as a lump of local clay and passes through many hands before it reaches yours. We work slowly, in small batches, so that each form keeps the quiet marks of the wheel.';

  const copyCode = async (code) => {
    try { await navigator.clipboard.writeText(code); toast.success(`Code ${code} copied`); } catch { toast(code); }
  };

  return (
    <div className="hp">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="hp-hero"
        aria-roledescription="carousel"
        aria-label="Featured"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div ref={depthRef} className="hp-hero-depth">
          {slides.map((sl, i) => (
            <img
              key={`${sl.src}-${i}`}
              src={sl.src}
              alt={i === slide % count ? sl.alt : ''}
              aria-hidden={i !== slide % count}
              className={`hp-hero-img${i === slide % count ? ' is-active' : ''}`}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </div>
        <div className="hp-hero-shade" aria-hidden="true" />
        <div className="container hp-hero-inner">
          <div ref={copyRef} className="hp-hero-copy-depth">
          <div className="hp-hero-copy" key={slide}>
            <p className="hp-eyebrow hp-eyebrow-light">{brand?.tagline || 'Village clay, shaped by skilled hands'}</p>
            <h1 className="hp-hero-title display">{current.title || 'Handmade pottery for slow, beautiful living'}</h1>
            <p className="hp-hero-sub">{current.subtitle || 'Wheel-thrown and kiln-fired in small batches at our workshop — made to be used every day.'}</p>
            <div className="hp-hero-cta">
              <SmartLink to={current.link || '/products'} className="hp-btn hp-btn-light" magnetic>{current.cta || 'Shop the collection'} <FiArrowRight /></SmartLink>
              <Link to="/about" className="hp-btn hp-btn-ghost-light">Our story</Link>
            </div>
          </div>
          </div>
          {count > 1 && (
            <div className="hp-hero-nav">
              <span className="hp-hero-count">{String((slide % count) + 1).padStart(2, '0')} <i /> {String(count).padStart(2, '0')}</span>
              <button type="button" onClick={() => go(-1)} aria-label="Previous slide"><FiChevronLeft /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next slide"><FiChevronRight /></button>
            </div>
          )}
        </div>
        {!reducedMotion && <span className="hp-scroll-cue" aria-hidden="true" />}
        {count > 1 && (
          <div className="hp-hero-progress" aria-hidden="true">
            {slides.map((_, i) => <span key={i} className={i === slide % count ? 'is-active' : ''} />)}
          </div>
        )}
      </section>

      {/* ── Promises ─────────────────────────────────────────── */}
      <div className="hp-promises">
        <div className="container hp-promises-inner">
          {PROMISES.map((p) => <span key={p}>{p}</span>)}
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="hp-section">
          <div className="container">
            <header className="hp-head hp-head-center reveal">
              <p className="hp-eyebrow">Shop by category</p>
              <h2 className="hp-title display">Find your piece</h2>
            </header>
            <div className="hp-cats">
              {categories.map((cat) => (
                <Link key={cat._id} to={`/products?category=${cat._id}`} className="hp-cat reveal" data-cursor="Explore">
                  <span className="hp-cat-arch">
                    {cat.image?.url ? <img src={cat.image.url} alt="" loading="lazy" /> : <span className="hp-cat-fallback">{cat.name[0]}</span>}
                  </span>
                  <span className="hp-cat-name display">{cat.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Marquee words={MARQUEE_WORDS} />

      {/* ── Bestsellers ──────────────────────────────────────── */}
      {!loading && featured.length > 0 && (
        <section className="hp-section hp-section-tint">
          <div className="container">
            <header className="hp-head reveal">
              <div>
                <p className="hp-eyebrow">Most loved</p>
                <h2 className="hp-title display">Bestsellers</h2>
              </div>
              <Link to="/products?isFeatured=true" className="hp-link">View all <FiArrowRight /></Link>
            </header>
            <div className="product-grid hp-grid">
              {featured.map((p) => <TiltCard key={p._id}><ProductCard product={p} /></TiltCard>)}
            </div>
          </div>
        </section>
      )}

      {/* ── Story / process ──────────────────────────────────── */}
      <section className="hp-section">
        <div className="container hp-story">
          <figure className="hp-story-media reveal">
            <img src={STORY_IMAGE} alt="Clay, tools and glazes in the Charu Pottery studio" loading="lazy" />
            <figcaption>From our workshop</figcaption>
          </figure>
          <div className="hp-story-copy reveal">
            <p className="hp-eyebrow">The art of slow making</p>
            <h2 className="hp-title display">Shaped by hand, <em>never rushed</em></h2>
            <p className="hp-story-text">{storyText}</p>
            <Link to="/about" className="hp-link" data-magnetic>Meet the makers <FiArrowRight /></Link>
          </div>
        </div>
      </section>

      <ScrollProcess steps={PROCESS} />

      <PotteryWheel categories={categories} />

      {/* ── Offer band ───────────────────────────────────────── */}
      {leadOffer && (
        <section className="hp-offer reveal">
          <div className="container hp-offer-inner">
            <div>
              <p className="hp-eyebrow hp-eyebrow-light">Offer of the week</p>
              <p className="hp-offer-value display">{leadOffer.type === 'PERCENT' ? `${leadOffer.value / 100}% off` : `${formatPaise(leadOffer.value)} off`}</p>
              <p className="hp-offer-desc">
                {leadOffer.description || 'On your order'}
                {leadOffer.minOrderPaise ? ` · on orders above ${formatPaise(leadOffer.minOrderPaise)}` : ''}
                {leadOffer.endsAt ? ` · till ${new Date(leadOffer.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </div>
            <button type="button" className="hp-code" data-cursor="Copy" onClick={() => copyCode(leadOffer.code)} aria-label={`Copy coupon code ${leadOffer.code}`}>
              <span>{leadOffer.code}</span><FiCopy />
            </button>
          </div>
          {offers.length > 1 && (
            <div className="container hp-offer-more">
              {offers.slice(1).map((o) => (
                <button type="button" key={o.code} className="hp-chip" onClick={() => copyCode(o.code)}>
                  {o.code} · {o.type === 'PERCENT' ? `${o.value / 100}% off` : `${formatPaise(o.value)} off`}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <Lookbook chapters={RITUALS} categories={categories} />

      {/* ── New arrivals ─────────────────────────────────────── */}
      {!loading && newArrivals.length > 0 && (
        <section className="hp-section">
          <div className="container">
            <header className="hp-head reveal">
              <div>
                <p className="hp-eyebrow">Fresh from the kiln</p>
                <h2 className="hp-title display">New arrivals</h2>
              </div>
              <Link to="/products?sort=newest" className="hp-link">Shop new <FiArrowRight /></Link>
            </header>
            <div className="product-grid hp-grid">
              {newArrivals.map((p) => <TiltCard key={p._id}><ProductCard product={p} /></TiltCard>)}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials (approved reviews only) ─────────────── */}
      {testimonials.length > 0 && (
        <section className="hp-section hp-section-tint">
          <div className="container">
            <header className="hp-head hp-head-center reveal">
              <p className="hp-eyebrow">Kind words</p>
              <h2 className="hp-title display">From our customers</h2>
            </header>
            <div className="hp-quotes">
              {testimonials.map((t) => (
                <figure key={t._id} className="hp-quote reveal">
                  <span className="hp-stars" aria-label={`${t.rating} out of 5 stars`}>{'★'.repeat(t.rating)}<span>{'★'.repeat(5 - t.rating)}</span></span>
                  <blockquote className="display">“{t.comment}”</blockquote>
                  <figcaption>
                    <strong>{t.user?.name || 'A customer'}</strong>
                    <Link to={`/products/${t.productSlug}`}>{t.productName}</Link>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Journal: weekly updates & launches ───────────────── */}
      {brand?.weeklyUpdates?.length > 0 && (
        <section className="hp-section">
          <div className="container">
            <header className="hp-head reveal">
              <div>
                <p className="hp-eyebrow">Studio journal</p>
                <h2 className="hp-title display">This week at Charu</h2>
              </div>
            </header>
            <div className="hp-journal">
              {brand.weeklyUpdates.map((u, i) => (
                <article key={i} className="hp-journal-item reveal">
                  {u.date && <time>{new Date(u.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</time>}
                  <h3 className="display">{u.title}</h3>
                  <p>{u.body}</p>
                  {u.link && <SmartLink to={u.link} className="hp-link">Read more <FiArrowRight /></SmartLink>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Social ───────────────────────────────────────────── */}
      {brand?.socialPosts?.length > 0 && (
        <section className="hp-section hp-section-tight">
          <div className="container">
            <header className="hp-head reveal">
              <div>
                <p className="hp-eyebrow">Follow along</p>
                <h2 className="hp-title display">Inside the studio</h2>
              </div>
              {brand.social?.instagram && (
                <a href={brand.social.instagram} target="_blank" rel="noopener noreferrer" className="hp-link"><FiInstagram /> Instagram</a>
              )}
            </header>
            <div className="hp-social">
              {brand.socialPosts.slice(0, 6).map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="hp-social-item reveal" aria-label={p.caption || `${p.platform} post`}>
                  {p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" /> : <span className="hp-social-fallback">{p.platform}</span>}
                  {p.caption && <span className="hp-social-cap">{p.caption}</span>}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Commission CTA ───────────────────────────────────── */}
      <section className="hp-cta">
        <div className="container hp-cta-inner reveal">
          <p className="hp-eyebrow hp-eyebrow-light">Custom & bulk orders</p>
          <h2 className="display">Made to order, made for you</h2>
          <p>Wedding favours, corporate gifts or a dinner set in your colours — tell us what you have in mind.</p>
          <Link to="/contact" className="hp-btn hp-btn-light" data-magnetic>Start a conversation <FiArrowRight /></Link>
        </div>
      </section>
    </div>
  );
}
