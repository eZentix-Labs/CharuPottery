import React from 'react';
import { Link } from 'react-router-dom';
import { FiMapPin, FiClock, FiPhone, FiMail } from 'react-icons/fi';
import useBrand from '../hooks/useBrand';
import './AboutPage.css';

/**
 * About Us: brand story, founder & co-founder, workshop location
 * (CP-CUST-022, CP-CUST-023). All text comes from Admin → Brand & Banners.
 */
export default function AboutPage() {
  const brand = useBrand();
  if (!brand) return <div className="page-loader"><div className="spinner" /></div>;
  const w = brand.workshop || {};
  const empty = !brand.about && !brand.story && !(brand.founders || []).length;

  return (
    <div className="about-page">
      <div className="container">
        <header className="about-hero">
          <p className="section-eyebrow">Our story</p>
          <h1 className="display about-title">{brand.tagline || 'Handmade clay art from our village workshop'}</h1>
          {brand.about && <p className="about-lead">{brand.about}</p>}
          {empty && <p className="about-lead">Our story is being written — check back soon, or <Link to="/contact">get in touch</Link>.</p>}
        </header>

        {brand.story && (
          <section className="about-story">
            {brand.story.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          </section>
        )}

        {(brand.founders || []).length > 0 && (
          <section className="about-founders" aria-labelledby="founders-h">
            <h2 id="founders-h" className="section-title display">The hands behind Charu</h2>
            <div className="founders-grid">
              {brand.founders.map((f, i) => (
                <article key={i} className="founder-card">
                  {f.photo ? <img src={f.photo} alt={f.name} className="founder-photo" loading="lazy" /> : <div className="founder-photo placeholder" aria-hidden="true">{(f.name || '?')[0]}</div>}
                  <h3 className="display">{f.name}</h3>
                  {f.role && <p className="founder-role">{f.role}</p>}
                  {f.bio && <p className="founder-bio">{f.bio}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {(w.address || w.name) && (
          <section className="about-workshop" aria-labelledby="workshop-h">
            <h2 id="workshop-h" className="section-title display">Visit our workshop</h2>
            <div className="workshop-card">
              {w.name && <h3 className="display">{w.name}</h3>}
              {w.address && <p><FiMapPin /> {w.address}{w.city ? `, ${w.city}` : ''}</p>}
              {w.hours && <p><FiClock /> {w.hours}</p>}
              {w.phone && <p><FiPhone /> <a href={`tel:${w.phone}`}>{w.phone}</a></p>}
              {w.email && <p><FiMail /> <a href={`mailto:${w.email}`}>{w.email}</a></p>}
              {w.visitingInfo && <p className="workshop-info">{w.visitingInfo}</p>}
              {w.mapUrl && <a className="btn btn-outline" href={w.mapUrl} target="_blank" rel="noopener noreferrer">Open in Maps</a>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
