// Usage: npm run seed   -> inserts a demo admin user and sample products
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('../db');

(async () => {
  await initSchema();
  const hash = await bcrypt.hash('Demo@123', 10);
  await pool.query(
    "INSERT IGNORE INTO users (name,email,password_hash,role) VALUES ('Demo Admin','admin@demo.com',?, 'admin')", [hash]);
  const products = [
    ['Wireless Mouse', 'SKU-1001', 'Accessories', 1500, 50],
    ['Mechanical Keyboard', 'SKU-1002', 'Accessories', 6500, 25],
    ['27" Monitor', 'SKU-1003', 'Displays', 42000, 12],
    ['USB-C Hub', 'SKU-1004', 'Accessories', 3200, 40],
    ['Laptop Stand', 'SKU-1005', 'Furniture', 2800, 8],
    ['Webcam HD', 'SKU-1006', 'Peripherals', 5200, 30]
  ];
  for (const p of products)
    await pool.query('INSERT IGNORE INTO products (name,sku,category,price,stock) VALUES (?,?,?,?,?)', p);
  console.log('Seed complete. Login: admin@demo.com / Demo@123');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
