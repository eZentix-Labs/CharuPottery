import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';

/**
 * "Everyday rituals" lookbook: a sticky photo frame on one side that
 * cross-fades (with a gentle 3D turn) as each story panel scrolls past.
 */
export default function Lookbook({ chapters, categories = [] }) {
  const [active, setActive] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number(e.target.dataset.index));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [chapters.length]);

  const linkFor = (name) => {
    const c = categories.find((x) => x.name === name);
    return c ? `/products?category=${c._id}` : '/products';
  };

  return (
    <section className="lb" aria-labelledby="lb-title">
      <div className="container lb-grid">
        <div className="lb-frame-wrap">
          <div className="lb-frame">
            {chapters.map((c, i) => (
              <img
                key={c.title}
                src={c.img}
                alt={i === active ? c.alt : ''}
                aria-hidden={i !== active}
                className={i === active ? 'is-active' : i < active ? 'is-before' : 'is-after'}
                loading="lazy"
              />
            ))}
            <span className="lb-frame-count" aria-hidden="true">{String(active + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span>
          </div>
        </div>
        <div className="lb-chapters">
          <header className="lb-intro">
            <p className="hp-eyebrow">Everyday rituals</p>
            <h2 id="lb-title" className="hp-title display">Made to be <em>used</em>, not kept on a shelf</h2>
          </header>
          {chapters.map((c, i) => (
            <article
              key={c.title}
              ref={(el) => { refs.current[i] = el; }}
              data-index={i}
              className={`lb-chapter${i === active ? ' is-active' : ''}`}
            >
              <span className="lb-time">{c.time}</span>
              <h3 className="display">{c.title}</h3>
              <p>{c.text}</p>
              <Link to={linkFor(c.category)} className="hp-link" data-magnetic>Shop {c.category} <FiArrowRight /></Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
