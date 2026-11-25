import React from 'react';
import { Link } from 'react-router-dom';
import { FiMapPin, FiClock, FiPhone, FiMail, FiArrowRight } from 'react-icons/fi';
import useBrand from '../hooks/useBrand';
import useReveal from '../hooks/useReveal';
import './AboutPage.css';

/**
 * About Us: brand story, founder & co-founder, workshop location
 * (CP-CUST-022, CP-CUST-023).
 *
 * Admin → Brand content (tagline, about, story, founders, workshop) is shown
 * whenever it exists. The chapter narrative below is general craft copy that
 * only uses facts already published on the site (handmade, wheel-thrown,
 * kiln-fired, workshop in Mankar), so the page is never empty and never
 * invents biography. Photos are placeholders until the client supplies
 * real workshop photography.
 */
const U = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?q=72&w=${w}&auto=format&fit=crop`;

const CHAPTERS = [
  {
    n: 'I',
    title: 'It begins with a handful of earth',
    text: 'Before it is a cup or a vase, it is simply clay: heavy, cool and full of air. We knead it by hand, again and again, until it is calm enough to listen.',
    img: U('1595351298020-038700609878'),
    alt: 'Clay, tools and glazes on the workshop bench',
  },
  {
    n: 'II',
    title: 'Then, patience',
    text: 'On the wheel there is no rushing. Fingers find the centre, the walls rise slowly, and for a few quiet minutes the whole world is just this one shape.',
    img: U('1565193566173-7a0ee3dbe261'),
    alt: 'Slender wheel-thrown stoneware vases',
  },
  {
    n: 'III',
    title: 'Then, the fire',
    text: 'Every piece waits its turn for the kiln. Hours of heat turn something fragile into something that can be used every day, and no two come out quite the same.',
    img: U('1520408222757-6f9f95d87d5d'),
    alt: 'Kiln-fired terracotta vessels',
  },
  {
    n: 'IV',
    title: 'And then, your home',
    text: 'The last chapter isn’t ours to write. A morning chai, a Sunday lunch, a single flower on the windowsill: that is where a piece finally becomes what it was made for.',
    img: U('1610701596061-2ecf227e85b2'),
    alt: 'Handmade plates and bowls on a wooden table',
  },
];

const VALUES = [
  { title: 'Slow, on purpose', text: 'We make in small batches. It takes longer, and we think you can feel the difference.' },
  { title: 'Marks of the hand', text: 'A ripple in the wall, a softer rim, a drip of glaze. They aren’t flaws; they’re proof that a person was here.' },
  { title: 'Made in Mankar', text: 'Every piece is shaped and fired at our workshop in Purba Bardhaman, West Bengal.' },
];

// Published on the Contact page; used only when Admin → Brand has no workshop yet.
const WORKSHOP_FALLBACK = {
  name: 'The Charu workshop',
  address: 'Mankar Yard, Mankar',
  city: 'Purba Bardhaman, West Bengal',
  hours: 'Monday – Sunday, 10:00am – 7:00pm',
  mapUrl: 'https://maps.app.goo.gl/K5Um1bLj9zTLzFGF9',
  visitingInfo: 'Walk-ins are welcome during working hours. Come and watch a piece being made.',
};

export default function AboutPage() {
  const brand = useBrand() || {};
  useReveal([brand.story, (brand.founders || []).length]);

  const founders = brand.founders || [];
  const hasWorkshop = brand.workshop && (brand.workshop.address || brand.workshop.name);
  const w = hasWorkshop ? brand.workshop : WORKSHOP_FALLBACK;
  const title = brand.tagline || 'Made by hand. Meant for yours.';
  const lead = brand.about || 'Charu is a small pottery workshop in Mankar, West Bengal. We shape everyday pieces from clay, slowly and by hand, for homes that love things with a story.';

  return (
    <div className="about-page">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="ab-hero">
        <img className="ab-hero-img" src={U('1493106641515-6b5631de4bb9', 2000)} alt="" aria-hidden="true" />
        <div className="ab-hero-shade" aria-hidden="true" />
        <div className="container ab-hero-inner">
          <p className="ab-eyebrow ab-rise" style={{ '--d': '0s' }}>Our story</p>
          <h1 className="display ab-hero-title ab-rise" style={{ '--d': '.15s' }}>{title}</h1>
          <p className="ab-hero-lead ab-rise" style={{ '--d': '.35s' }}>{lead}</p>
          <span className="ab-scroll ab-rise" style={{ '--d': '.6s' }} aria-hidden="true">Scroll to read <i /></span>
        </div>
      </header>

      {/* ── Opening line ─────────────────────────────────────── */}
      <section className="ab-intro container">
        <p className="display ab-intro-text reveal">
          Every piece of clay that leaves our workshop has been <em>held</em>: kneaded, shaped, trimmed,
          glazed and fired by hand. This is the quiet journey it takes before it reaches you.
        </p>
      </section>

      {/* ── Chapters ─────────────────────────────────────────── */}
      <section className="ab-chapters container" aria-label="How a piece comes to life">
        {CHAPTERS.map((c, i) => (
          <article key={c.n} className={`ab-chapter${i % 2 ? ' is-flip' : ''}`}>
            <figure className="ab-ch-media reveal">
              <img src={c.img} alt={c.alt} loading="lazy" />
            </figure>
            <div className="ab-ch-text reveal" style={{ transitionDelay: '.12s' }}>
              <span className="ab-ch-n display" aria-hidden="true">{c.n}</span>
              <p className="ab-ch-kicker">Chapter {i + 1}</p>
              <h2 className="display">{c.title}</h2>
              <p>{c.text}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── Quote ────────────────────────────────────────────── */}
      <section className="ab-quote">
        <div className="container">
          <span className="ab-quote-mark display" aria-hidden="true">“</span>
          <blockquote className="display reveal">
            Every piece carries a little of the hands that made it, and, in time, a little of the home that keeps it.
          </blockquote>
        </div>
      </section>

      {/* ── In our words (admin story) ───────────────────────── */}
      {brand.story && (
        <section className="ab-words container">
          <p className="ab-eyebrow reveal">In our words</p>
          <div className="ab-words-body reveal">
            {brand.story.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </section>
      )}

      {/* ── Values ───────────────────────────────────────────── */}
      <section className="ab-values container" aria-labelledby="values-h">
        <p className="ab-eyebrow reveal">What we believe</p>
        <h2 id="values-h" className="display ab-h2 reveal">Imperfect, on purpose</h2>
        <div className="ab-values-grid">
          {VALUES.map((v, i) => (
            <div key={v.title} className="ab-value reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
              <span className="ab-value-dot" aria-hidden="true" />
              <h3 className="display">{v.title}</h3>
              <p>{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Founders (admin) ─────────────────────────────────── */}
      {founders.length > 0 && (
        <section className="ab-founders container" aria-labelledby="founders-h">
          <p className="ab-eyebrow reveal">The people</p>
          <h2 id="founders-h" className="display ab-h2 reveal">The hands behind Charu</h2>
          <div className="founders-grid">
            {founders.map((f, i) => (
              <article key={i} className="founder-card reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
                {f.photo
                  ? <img src={f.photo} alt={f.name} className="founder-photo" loading="lazy" />
                  : <div className="founder-photo placeholder" aria-hidden="true">{(f.name || '?')[0]}</div>}
                <h3 className="display">{f.name}</h3>
                {f.role && <p className="founder-role">{f.role}</p>}
                {f.bio && <p className="founder-bio">{f.bio}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Workshop ─────────────────────────────────────────── */}
      <section className="ab-workshop" aria-labelledby="workshop-h">
        <div className="container ab-workshop-inner">
          <div className="ab-workshop-copy reveal">
            <p className="ab-eyebrow">Come and see</p>
            <h2 id="workshop-h" className="display ab-h2">Visit our workshop</h2>
            <p className="ab-workshop-lead">
              There is something about watching a lump of clay become a bowl that stays with you.
              If you are ever nearby, the door is open.
            </p>
          </div>
          <div className="workshop-card reveal" style={{ transitionDelay: '.12s' }}>
            {w.name && <h3 className="display">{w.name}</h3>}
            {w.address && <p><FiMapPin /> <span>{w.address}{w.city ? `, ${w.city}` : ''}</span></p>}
            {w.hours && <p><FiClock /> <span>{w.hours}</span></p>}
            {w.phone && <p><FiPhone /> <a href={`tel:${w.phone}`}>{w.phone}</a></p>}
            {w.email && <p><FiMail /> <a href={`mailto:${w.email}`}>{w.email}</a></p>}
            {w.visitingInfo && <p className="workshop-info">{w.visitingInfo}</p>}
            <div className="workshop-actions">
              {w.mapUrl && <a className="btn btn-primary" href={w.mapUrl} target="_blank" rel="noopener noreferrer">Get directions</a>}
              <Link className="btn btn-outline" to="/contact">Talk to us</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing ──────────────────────────────────────────── */}
      <section className="ab-close container">
        <h2 className="display reveal">Bring a little of our story home.</h2>
        <p className="reveal">Each piece is one of a kind, just like the home it’s going to.</p>
        <Link to="/products" className="btn btn-primary ab-close-btn reveal">Explore the collection <FiArrowRight /></Link>
      </section>
    </div>
  );
}
