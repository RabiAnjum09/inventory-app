const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth, requireAdmin, wrap, HttpError } = require('../middleware/auth');

// Module 2: Product / inventory management
function validate(b) {
  if (!b.name || !b.sku) throw new HttpError(400, 'Name and SKU are required');
  if (isNaN(b.price) || Number(b.price) < 0) throw new HttpError(400, 'Price must be a non-negative number');
  if (!Number.isInteger(Number(b.stock)) || Number(b.stock) < 0) throw new HttpError(400, 'Stock must be a non-negative integer');
}

router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const like = `%${q}%`;
  const [rows] = q
    ? await pool.query('SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? OR category LIKE ? ORDER BY id DESC', [like, like, like])
    : await pool.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Product not found');
  res.json(rows[0]);
}));

router.post('/', wrap(async (req, res) => {
  validate(req.body);
  const { name, sku, category = 'General', price, stock } = req.body;
  try {
    const [r] = await pool.query('INSERT INTO products (name,sku,category,price,stock) VALUES (?,?,?,?,?)',
      [name, sku, category, price, stock]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'SKU already exists');
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  validate(req.body);
  const { name, sku, category = 'General', price, stock } = req.body;
  try {
    const [r] = await pool.query('UPDATE products SET name=?,sku=?,category=?,price=?,stock=? WHERE id=?',
      [name, sku, category, price, stock, req.params.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Product not found');
    res.json({ message: 'Updated' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'SKU already exists');
    throw e;
  }
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM products WHERE id=?', [req.params.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Product not found');
    res.json({ message: 'Deleted' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') throw new HttpError(409, 'Product is used in existing orders');
    throw e;
  }
}));

module.exports = router;
