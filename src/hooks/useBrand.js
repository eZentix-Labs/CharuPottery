import { useEffect, useState } from 'react';
import api from '../api/axios';

// Brand content (social links, founders, workshop) — fetched once per page load.
let cache = null;
let inflight = null;

export default function useBrand() {
  const [brand, setBrand] = useState(cache);
  useEffect(() => {
    if (cache) return;
    inflight = inflight || api.get('/content/brand').then(({ data }) => { cache = data.data; return cache; }).catch(() => null);
    inflight.then((b) => { if (b) setBrand(b); });
  }, []);
  return brand;
}
