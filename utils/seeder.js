/**
 * Run with: npm run seed
 * Populates the database with an admin user, sample categories, and sample
 * pottery/ceramics products — useful for local development & demos.
 */
const dotenv = require('dotenv');
const mongoose = require('mongoose');
dotenv.config();

const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');

const seed = async () => {
  await connectDB();

  console.log('🧹 Clearing existing data...');
  await Promise.all([
    User.deleteMany({ role: 'admin' }),
    Category.deleteMany(),
    Product.deleteMany(),
  ]);

  console.log('👤 Creating admin user...');
  const admin = await User.create({
    name: 'Store Admin',
    email: 'admin@charu.in',
    password: 'Admin@123',
    role: 'admin',
  });

  console.log('📂 Creating categories...');
  const categories = await Category.create([
    { name: 'Vases', description: 'Handcrafted ceramic and stoneware vases' },
    { name: 'Mugs & Cups', description: 'Everyday and artisan drinkware' },
    { name: 'Bowls & Plates', description: 'Tableware for everyday dining' },
    { name: 'Planters', description: 'Ceramic pots for plants and succulents' },
    { name: 'Decorative Art', description: 'Sculptures and decorative clay pieces' },
  ]);

  const [vases, mugs, bowls, planters, decor] = categories;

  console.log('🏺 Creating sample products...');
  await Product.create([
    {
      name: 'Handthrown Stoneware Vase — Earth Tone',
      description:
        'A beautifully hand-thrown stoneware vase with a matte earth-tone glaze. Each piece is unique, bearing the subtle marks of the potter\'s wheel. Perfect for dried or fresh floral arrangements.',
      shortDescription: 'Hand-thrown stoneware vase with matte earth-tone glaze.',
      price: 1499,
      discountPrice: 1199,
      category: vases._id,
      clayType: 'Stoneware',
      glazeType: 'Matte Earth Glaze',
      technique: 'Wheel-thrown',
      firingTechnique: 'Kiln-fired at 1200°C',
      color: ['Terracotta Brown', 'Beige'],
      dimensions: { height: 25, diameter: 12, weight: 850 },
      isHandmade: true,
      artisan: { name: 'Meera Joshi', location: 'Jaipur, India' },
      images: [{ url: 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?q=80&w=800&auto=format&fit=crop', altText: 'Stoneware vase' }],
      stock: 18,
      isFeatured: true,
      tags: ['vase', 'stoneware', 'handmade', 'home decor'],
    },
    {
      name: 'Glazed Ceramic Coffee Mug — Set of 2',
      description:
        'A set of two glazed ceramic mugs, hand-built and food-safe. Each mug holds approximately 300ml — perfect for your morning coffee or tea ritual.',
      shortDescription: 'Set of 2 hand-built ceramic coffee mugs, 300ml each.',
      price: 899,
      category: mugs._id,
      clayType: 'Earthenware',
      glazeType: 'Glossy Celadon',
      technique: 'Hand-built',
      color: ['Sage Green'],
      dimensions: { height: 9, diameter: 8, weight: 280 },
      isFoodSafe: true,
      isDishwasherSafe: true,
      isHandmade: true,
      artisan: { name: 'Ravi Kumar', location: 'Khurja, India' },
      images: [{ url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?q=80&w=800&auto=format&fit=crop', altText: 'Ceramic mugs' }],
      stock: 32,
      isFeatured: true,
      tags: ['mug', 'ceramic', 'coffee', 'gift'],
    },
    {
      name: 'Rustic Terracotta Serving Bowl',
      description:
        'A rustic terracotta bowl ideal for serving salads, fruits, or as a centerpiece. Finished with a food-safe clear glaze on the interior.',
      shortDescription: 'Rustic terracotta serving bowl, food-safe glazed interior.',
      price: 749,
      category: bowls._id,
      clayType: 'Terracotta',
      technique: 'Wheel-thrown',
      color: ['Natural Terracotta'],
      dimensions: { height: 10, diameter: 24, weight: 620 },
      isFoodSafe: true,
      isHandmade: true,
      artisan: { name: 'Lakshmi Devi', location: 'Pondicherry, India' },
      images: [{ url: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=800&auto=format&fit=crop', altText: 'Terracotta bowl' }],
      stock: 24,
      tags: ['bowl', 'terracotta', 'serving', 'kitchen'],
    },
    {
      name: 'Minimalist Ceramic Planter with Saucer',
      description:
        'A clean, minimalist ceramic planter with a matching saucer, designed for indoor succulents and small houseplants. Drainage hole included.',
      shortDescription: 'Minimalist ceramic planter with drainage hole and saucer.',
      price: 599,
      category: planters._id,
      clayType: 'Stoneware',
      glazeType: 'Matte White',
      technique: 'Slip-cast',
      color: ['White', 'Off-white'],
      dimensions: { height: 14, diameter: 14, weight: 450 },
      isHandmade: true,
      artisan: { name: 'Studio Mitti', location: 'Auroville, India' },
      images: [{ url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=800&auto=format&fit=crop', altText: 'Ceramic planter' }],
      stock: 40,
      isNewArrival: true,
      tags: ['planter', 'pot', 'succulent', 'home'],
    },
    {
      name: 'Hand-built Ceramic Abstract Sculpture',
      description:
        'A one-of-a-kind abstract sculpture, hand-built using traditional coiling techniques and finished with a reactive glaze that produces unique color variations on every piece.',
      shortDescription: 'One-of-a-kind hand-built abstract ceramic sculpture.',
      price: 3499,
      category: decor._id,
      clayType: 'Stoneware',
      glazeType: 'Reactive Glaze',
      technique: 'Coiled',
      color: ['Multi-tone Blue'],
      dimensions: { height: 32, width: 18, weight: 1400 },
      isHandmade: true,
      madeToOrder: true,
      processingTime: '7-10 business days',
      artisan: { name: 'Anjali Rao', location: 'Bengaluru, India' },
      images: [{ url: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?q=80&w=800&auto=format&fit=crop', altText: 'Ceramic sculpture' }],
      stock: 5,
      isFeatured: true,
      tags: ['sculpture', 'decor', 'art', 'collectible'],
    },
  ]);

  console.log('✅ Seed complete!');
  console.log(`   Admin login → email: admin@charu.in | password: Admin@123`);

  mongoose.connection.close();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seeder error:', err);
  process.exit(1);
});
