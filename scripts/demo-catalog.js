/**
 * DEMO CATALOGUE — local development only (used by scripts/dev-memory-server.js).
 * Placeholder photos come from Unsplash; product copy, founders and the
 * workshop are illustrative and must be replaced with Charu Pottery's real
 * content before launch (DEC-13). Never run this against a real database.
 */
const IMG = (id, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;

// Photos verified to load and to show pottery (checked visually).
const P = {
  mintPlanter: '1485955900006-10f4d324d411',
  wheel: '1493106641515-6b5631de4bb9',
  whiteMug: '1514228742587-6b1558fcca3d',
  vaseAndCups: '1525974160448-038dacadcc71',
  greyVases: '1565193566173-7a0ee3dbe261',
  stackedPlates: '1578749556568-bc2c40e68b61',
  stackedCups: '1590422749897-47036da0b0ff',
  studio: '1595351298020-038700609878',
  twoBowls: '1603199506016-b9a594b593c0',
  colourPlates: '1605883705077-8d3d3cebe78c',
  cupSet: '1610701596007-11502861dcfa',
  tableware: '1610701596061-2ecf227e85b2',
  tableware2: '1610701596295-4dc5d6289214',
  whiteVase: '1612196808214-b8e1d6145a8c',
  terracottaPot: '1459411552884-841db9b3cc2a',
  stonePlanter: '1509423350716-97f9360b4e09',
  terracottaVases: '1520408222757-6f9f95d87d5d',
  teaMug: '1544787219-7f47ccb76574',
  teaCup: '1571934811356-5cc061b6821f',
  tableSetting: '1576020799627-aeac74d58064',
  smallPlanter: '1530018607912-eff2daa1bac4',
};

const CATEGORIES = [
  { key: 'vases', name: 'Vases', description: 'Wheel-thrown vases for fresh and dried flowers', image: P.greyVases, displayOrder: 1 },
  { key: 'mugs', name: 'Mugs & Cups', description: 'Everyday drinkware, from chai cups to coffee mugs', image: P.stackedCups, displayOrder: 2 },
  { key: 'bowls', name: 'Bowls', description: 'Serving, soup and snack bowls', image: P.twoBowls, displayOrder: 3 },
  { key: 'plates', name: 'Plates & Dinnerware', description: 'Plates, platters and complete dinner sets', image: P.stackedPlates, displayOrder: 4 },
  { key: 'planters', name: 'Planters', description: 'Terracotta and stoneware pots for indoor plants', image: P.terracottaPot, displayOrder: 5 },
  { key: 'decor', name: 'Terracotta & Decor', description: 'Traditional terracotta pieces and decorative clay art', image: P.terracottaVases, displayOrder: 6 },
  { key: 'gifts', name: 'Gift Sets', description: 'Curated handmade sets, ready to gift', image: P.cupSet, displayOrder: 7 },
];

// price/discountPrice in rupees; images: first is the main image.
const PRODUCTS = [
  // Vases
  { cat: 'vases', name: 'Ash Grey Bottle Vase Trio', price: 2899, discountPrice: 2399, stock: 6, clayType: 'Stoneware', glazeType: 'Matte Ash Glaze', technique: 'Wheel-thrown', color: ['Grey'], dims: { height: 28, diameter: 9, weight: 1400 }, images: [P.greyVases, P.vaseAndCups], featured: true, short: 'Three slender bottle vases in a soft matte ash glaze.' },
  { cat: 'vases', name: 'Ivory Moon Vase', price: 3499, stock: 3, clayType: 'Porcelain', glazeType: 'Satin White', technique: 'Wheel-thrown', color: ['Ivory'], dims: { height: 32, diameter: 22, weight: 1900 }, images: [P.whiteVase], newArrival: true, short: 'A full, rounded porcelain vase with a satin finish.' },
  { cat: 'vases', name: 'Speckled Stoneware Bud Vase', price: 899, stock: 14, clayType: 'Stoneware', glazeType: 'Speckled White', technique: 'Wheel-thrown', color: ['White', 'Speckled'], dims: { height: 18, diameter: 8, weight: 520 }, images: [P.vaseAndCups, P.greyVases], short: 'A small bud vase for a single stem.' },
  { cat: 'vases', name: 'Terracotta Surahi Vase', price: 1299, discountPrice: 999, stock: 2, clayType: 'Terracotta', glazeType: 'Unglazed', technique: 'Wheel-thrown', color: ['Terracotta'], dims: { height: 30, diameter: 16, weight: 1200 }, images: [P.terracottaVases], short: 'Traditional long-neck surahi shape in natural red clay.' },

  // Mugs & Cups
  { cat: 'mugs', name: 'Hand-Pinched Chai Cups (Set of 4)', price: 1599, discountPrice: 1299, stock: 10, clayType: 'Stoneware', glazeType: 'Cream Matte', technique: 'Hand-built', color: ['Cream'], dims: { height: 8, diameter: 7, weight: 600 }, images: [P.stackedCups, P.cupSet], featured: true, food: true, short: 'Four hand-pinched cups, each one slightly different.' },
  { cat: 'mugs', name: 'Everyday White Coffee Mug', price: 649, stock: 25, clayType: 'Stoneware', glazeType: 'Glossy White', technique: 'Wheel-thrown', color: ['White'], dims: { height: 9, diameter: 9, weight: 380 }, images: [P.whiteMug, P.teaMug], microwave: true, dishwasher: true, food: true, short: 'A generous 350 ml mug with a comfortable handle.' },
  { cat: 'mugs', name: 'Blue Rim Tea Cup', price: 549, stock: 18, clayType: 'Stoneware', glazeType: 'Cobalt Rim', technique: 'Wheel-thrown', color: ['White', 'Blue'], dims: { height: 7, diameter: 10, weight: 300 }, images: [P.teaCup], newArrival: true, food: true, short: 'A wide tea cup with a hand-painted cobalt rim.' },
  { cat: 'mugs', name: 'Latte Mug with Saucer', price: 899, discountPrice: 749, stock: 0, clayType: 'Stoneware', glazeType: 'Oatmeal', technique: 'Wheel-thrown', color: ['Oatmeal'], dims: { height: 10, diameter: 9, weight: 480 }, images: [P.teaMug, P.whiteMug], food: true, short: 'Currently sold out — a cosy mug with matching saucer.' },

  // Bowls
  { cat: 'bowls', name: 'Indigo Pattern Serving Bowls (Pair)', price: 1899, stock: 7, clayType: 'Stoneware', glazeType: 'Indigo Stencil', technique: 'Wheel-thrown', color: ['Indigo', 'Ochre'], dims: { height: 9, diameter: 18, weight: 1100 }, images: [P.twoBowls, P.tableware], featured: true, food: true, short: 'Two nesting bowls with a hand-stencilled indigo pattern.' },
  { cat: 'bowls', name: 'Speckled Soup Bowl', price: 749, stock: 20, clayType: 'Stoneware', glazeType: 'Speckled Cream', technique: 'Wheel-thrown', color: ['Cream'], dims: { height: 7, diameter: 15, weight: 450 }, images: [P.tableware2, P.tableware], microwave: true, food: true, short: 'Deep enough for dal, soup or khichdi.' },
  { cat: 'bowls', name: 'Mini Dip Bowls (Set of 6)', price: 1199, discountPrice: 999, stock: 9, clayType: 'Earthenware', glazeType: 'Mixed Pastel', technique: 'Hand-built', color: ['Pastel'], dims: { height: 4, diameter: 8, weight: 600 }, images: [P.cupSet, P.tableware2], newArrival: true, food: true, short: 'Six little bowls for chutneys, pickles and dips.' },

  // Plates
  { cat: 'plates', name: 'Sky Blue Dinner Plates (Set of 4)', price: 3299, discountPrice: 2799, stock: 5, clayType: 'Stoneware', glazeType: 'Sky Blue Reactive', technique: 'Wheel-thrown', color: ['Sky Blue'], dims: { diameter: 26, weight: 2600 }, images: [P.stackedPlates, P.tableSetting], featured: true, food: true, dishwasher: true, short: 'Reactive glaze makes every plate unique.' },
  { cat: 'plates', name: 'Pastel Quarter Plates (Set of 6)', price: 2499, stock: 8, clayType: 'Earthenware', glazeType: 'Pastel Mix', technique: 'Wheel-thrown', color: ['Pink', 'Blue', 'Yellow'], dims: { diameter: 18, weight: 1800 }, images: [P.colourPlates], newArrival: true, food: true, short: 'Six soft colours for breakfast and snacks.' },
  { cat: 'plates', name: 'Earth Tone Dinner Set (16 pcs)', price: 8999, discountPrice: 7499, stock: 2, clayType: 'Stoneware', glazeType: 'Earth Matte', technique: 'Wheel-thrown', color: ['Beige', 'Brown'], dims: { weight: 9000 }, images: [P.tableware, P.tableware2, P.tableSetting], featured: true, food: true, short: 'Plates, quarter plates, bowls and katoris for four.' },
  { cat: 'plates', name: 'Festive Serving Platter', price: 1999, stock: 4, clayType: 'Stoneware', glazeType: 'Floral Hand-painted', technique: 'Wheel-thrown', color: ['White', 'Gold'], dims: { diameter: 32, weight: 1500 }, images: [P.tableSetting, P.colourPlates], food: true, short: 'A large platter for festive spreads.' },

  // Planters
  { cat: 'planters', name: 'Classic Terracotta Pot', price: 449, stock: 30, clayType: 'Terracotta', glazeType: 'Unglazed', technique: 'Wheel-thrown', color: ['Terracotta'], dims: { height: 12, diameter: 12, weight: 700 }, images: [P.terracottaPot, P.smallPlanter], featured: true, food: false, short: 'Breathable red clay with a drainage hole.' },
  { cat: 'planters', name: 'Mint Glazed Succulent Planter', price: 699, discountPrice: 599, stock: 12, clayType: 'Stoneware', glazeType: 'Mint Gloss', technique: 'Wheel-thrown', color: ['Mint'], dims: { height: 10, diameter: 11, weight: 550 }, images: [P.mintPlanter], newArrival: true, food: false, short: 'A cheerful glazed pot for desk succulents.' },
  { cat: 'planters', name: 'Raw Stone Finish Planter', price: 1099, stock: 6, clayType: 'Stoneware', glazeType: 'Raw Stone', technique: 'Slip-cast', color: ['Stone'], dims: { height: 16, diameter: 15, weight: 1300 }, images: [P.stonePlanter], food: false, short: 'A minimal planter with a raw stone texture.' },
  { cat: 'planters', name: 'Tabletop Planter with Woven Detail', price: 799, stock: 1, clayType: 'Earthenware', glazeType: 'Blush Pattern', technique: 'Hand-built', color: ['Blush'], dims: { height: 9, diameter: 10, weight: 450 }, images: [P.smallPlanter], food: false, short: 'Only one left — a small patterned planter.' },

  // Terracotta & Decor
  { cat: 'decor', name: 'Terracotta Vessel Collection (5 pcs)', price: 3999, discountPrice: 3399, stock: 3, clayType: 'Terracotta', glazeType: 'Unglazed', technique: 'Wheel-thrown', color: ['Terracotta'], dims: { weight: 3200 }, images: [P.terracottaVases, P.studio], featured: true, food: false, short: 'Five traditional shapes for a console or shelf.' },
  { cat: 'decor', name: 'Studio Glaze Test Tiles (Wall Art)', price: 1499, stock: 5, clayType: 'Stoneware', glazeType: 'Assorted', technique: 'Hand-built', color: ['Assorted'], dims: { weight: 900 }, images: [P.studio], newArrival: true, food: false, short: 'Our favourite glaze experiments, framed for the wall.' },

  // Gift sets
  { cat: 'gifts', name: 'Chai Time Gift Box', price: 2199, discountPrice: 1899, stock: 8, clayType: 'Stoneware', glazeType: 'Cream & Ochre', technique: 'Wheel-thrown', color: ['Cream'], dims: { weight: 1500 }, images: [P.cupSet, P.stackedCups, P.teaCup], featured: true, food: true, short: 'Four cups and a small tray, gift-wrapped.' },
  { cat: 'gifts', name: 'Housewarming Gift Set', price: 4499, stock: 4, clayType: 'Stoneware', glazeType: 'Earth Matte', technique: 'Wheel-thrown', color: ['Beige'], dims: { weight: 3000 }, images: [P.vaseAndCups, P.tableware], newArrival: true, food: true, short: 'A bud vase, two mugs and a serving bowl.' },
];

const REVIEWS = [
  { product: 'Hand-Pinched Chai Cups (Set of 4)', rating: 5, title: 'Beautiful and sturdy', comment: 'Every cup is slightly different, which I love. They keep chai warm for longer than my old cups.' },
  { product: 'Hand-Pinched Chai Cups (Set of 4)', rating: 4, title: 'Lovely gift', comment: 'Bought these for my mother. Packaging was safe and the glaze is gorgeous.' },
  { product: 'Sky Blue Dinner Plates (Set of 4)', rating: 5, title: 'Stunning colour', comment: 'The reactive glaze looks different in every light. Very happy.' },
  { product: 'Classic Terracotta Pot', rating: 5, title: 'Plants are thriving', comment: 'Good drainage, nice weight and the clay breathes well. Ordering more.' },
  { product: 'Ash Grey Bottle Vase Trio', rating: 4, title: 'Elegant', comment: 'Perfect for dried flowers. Slightly smaller than I imagined but very pretty.' },
  { product: 'Indigo Pattern Serving Bowls (Pair)', rating: 5, title: 'Guests always ask about them', comment: 'The pattern is hand-done and it shows. Great size for serving.' },
];

const BRAND = {
  tagline: 'Village clay, shaped by skilled hands',
  about: 'Charu Pottery is a small family workshop making handmade clay pieces for everyday Indian homes. (Demo text — replace with the real story.)',
  story: 'It began with a single potter’s wheel in our courtyard. Today a small team of artisans throws, trims, glazes and fires every piece by hand.\n\nWe use local clay, fire in small batches and keep our designs simple so that the material speaks for itself. (Demo text.)',
  founders: [
    { name: 'Founder Name', role: 'Founder & Master Potter', bio: 'Has worked with clay for over twenty years and still throws every vase personally. (Demo profile.)', photo: IMG(P.wheel, 300) },
    { name: 'Co-Founder Name', role: 'Co-Founder & Glaze Designer', bio: 'Develops our glaze recipes and looks after the studio and customers. (Demo profile.)', photo: IMG(P.studio, 300) },
  ],
  workshop: { name: 'Charu Pottery Workshop (demo)', address: 'Workshop address goes here', city: 'Your City', hours: 'Mon–Sat, 10 am – 6 pm', phone: '', email: '', mapUrl: 'https://maps.google.com', visitingInfo: 'Visits by appointment. Watch a demonstration on the wheel and pick pieces straight from the shelves.' },
  social: { instagram: 'https://instagram.com', facebook: 'https://facebook.com', youtube: 'https://youtube.com', whatsapp: '', pinterest: '', x: '', linkedin: '' },
  socialPosts: [
    { platform: 'instagram', url: 'https://instagram.com', caption: 'Morning on the wheel', thumbnail: IMG(P.wheel, 400) },
    { platform: 'instagram', url: 'https://instagram.com', caption: 'Fresh out of the kiln', thumbnail: IMG(P.terracottaVases, 400) },
    { platform: 'instagram', url: 'https://instagram.com', caption: 'Glaze tests this week', thumbnail: IMG(P.studio, 400) },
    { platform: 'youtube', url: 'https://youtube.com', caption: 'How we make chai cups', thumbnail: IMG(P.stackedCups, 400) },
    { platform: 'instagram', url: 'https://instagram.com', caption: 'Table styled with our plates', thumbnail: IMG(P.tableSetting, 400) },
    { platform: 'instagram', url: 'https://instagram.com', caption: 'Planter season', thumbnail: IMG(P.terracottaPot, 400) },
  ],
  weeklyUpdates: [
    { title: 'New: pastel quarter plates', body: 'Six soft colours, fired this week in small batches.', date: new Date(), link: '/products?sort=newest' },
    { title: 'Workshop open day', body: 'Come watch a wheel demonstration this Saturday.', date: new Date(Date.now() - 3 * 86400000), link: '/about' },
  ],
  contentStatus: 'DEMO_PLACEHOLDER',
};

async function seedDemoCatalog(models, { admin }) {
  const { Category, Product, InventoryMovement, Banner, SiteContent, Coupon, Review, User, Notification } = models;

  const cats = {};
  for (const c of CATEGORIES) {
    cats[c.key] = await Category.create({ name: c.name, description: c.description, image: { url: IMG(c.image, 600) }, displayOrder: c.displayOrder });
  }

  const byName = {};
  for (const p of PRODUCTS) {
    const doc = await Product.create({
      name: p.name,
      shortDescription: p.short,
      description: `${p.short} Each piece is handmade, so size, colour and glaze vary slightly — that is part of its character. (Demo product.)`,
      price: p.price,
      discountPrice: p.discountPrice,
      category: cats[p.cat]._id,
      clayType: p.clayType,
      glazeType: p.glazeType,
      technique: p.technique,
      firingTechnique: 'Kiln-fired',
      color: p.color,
      dimensions: p.dims,
      isFoodSafe: p.food !== false,
      isMicrowaveSafe: !!p.microwave,
      isDishwasherSafe: !!p.dishwasher,
      isHandmade: true,
      isFeatured: !!p.featured,
      isNewArrival: !!p.newArrival,
      stock: p.stock,
      lowStockThreshold: 3,
      images: p.images.map((id) => ({ url: IMG(id), altText: p.name })),
      createdBy: admin._id,
    });
    byName[p.name] = doc;
    await InventoryMovement.create({ itemModel: 'Product', item: doc._id, type: 'INITIAL', quantity: doc.stock, availableDelta: doc.stock, availableAfter: doc.stock, reservedAfter: 0, reason: 'Demo seed' });
  }

  await Banner.create([
    { title: 'Handmade, small-batch pottery', subtitle: 'Shaped on the wheel, fired in our village kiln', ctaLabel: 'Shop the collection', link: '/products', image: { url: IMG(P.wheel, 1400), altText: 'Potter shaping clay on the wheel' }, sortOrder: 1 },
    { title: 'Festive tableware is here', subtitle: 'Dinner sets and platters for the season — up to 20% off', ctaLabel: 'Shop dinnerware', link: `/products?category=${cats.plates._id}`, image: { url: IMG(P.tableware, 1400), altText: 'Handmade tableware on a wooden table' }, sortOrder: 2 },
    { title: 'Terracotta, the timeless way', subtitle: 'Traditional shapes in natural red clay', ctaLabel: 'Explore terracotta', link: `/products?category=${cats.decor._id}`, image: { url: IMG(P.terracottaVases, 1400), altText: 'Group of terracotta vessels' }, sortOrder: 3 },
  ].map((b) => ({ ...b, updatedBy: admin._id })));

  await SiteContent.create({ key: 'brand', data: BRAND, updatedBy: admin._id });

  await Coupon.create([
    { code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', value: 1000, maxDiscountPaise: 50000, isPublic: true, perUserLimit: 1, createdBy: admin._id },
    { code: 'FESTIVE300', description: '₹300 off orders above ₹2,500', type: 'FLAT', value: 30000, minOrderPaise: 250000, isPublic: true, endsAt: new Date(Date.now() + 30 * 86400000), createdBy: admin._id },
  ]);

  const reviewers = [];
  for (const [i, n] of ['Ananya', 'Rahul', 'Meera'].entries()) {
    reviewers.push(await User.create({ name: `${n} (demo)`, email: `reviewer${i + 1}@dev.local`, password: `Review${i}2026x`, role: 'user' }));
  }
  for (const [i, r] of REVIEWS.entries()) {
    await Review.create({ product: byName[r.product]._id, user: reviewers[i % reviewers.length]._id, rating: r.rating, title: r.title, comment: r.comment, status: 'approved', isVerifiedPurchase: true });
  }

  await Notification.create({ audience: 'all', type: 'coupon', title: 'Welcome! Use WELCOME10 for 10% off', body: 'Valid on your first order.', link: '/products', createdBy: admin._id });

  return { categories: CATEGORIES.length, products: PRODUCTS.length, reviews: REVIEWS.length };
}

module.exports = { seedDemoCatalog };
