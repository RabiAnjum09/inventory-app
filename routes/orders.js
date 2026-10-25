const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth, wrap, HttpError } = require('../middleware/auth');

// Module 3: Orders (sales) + dashboard statistics
router.use(requireAuth);

router.get('/stats', wrap(async (req, res) => {
  const [[p]] = await pool.query('SELECT COUNT(*) AS products, COALESCE(SUM(stock),0) AS units, COALESCE(SUM(stock*price),0) AS value FROM products');
  const [[o]] = await pool.query("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status='completed'");
  const [low] = await pool.query('SELECT id,name,sku,stock FROM products WHERE stock < 10 ORDER BY stock ASC LIMIT 5');
  res.json({ ...p, ...o, lowStock: low });
}));

router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*, u.name AS staff_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`);
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!orders.length) throw new HttpError(404, 'Order not found');
  const [items] = await pool.query(
    `SELECT oi.*, p.name, p.sku FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`, [req.params.id]);
  res.json({ ...orders[0], items });
}));

router.post('/', wrap(async (req, res) => {
  const { customer_name, items } = req.body;
  if (!customer_name) throw new HttpError(400, 'Customer name is required');
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'At least one item is required');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'Quantity must be a positive integer');
      const [rows] = await conn.query('SELECT id,name,price,stock FROM products WHERE id=? FOR UPDATE', [it.product_id]);
      if (!rows.length) throw new HttpError(404, `Product ${it.product_id} not found`);
      const p = rows[0];
      if (p.stock < qty) throw new HttpError(400, `Insufficient stock for ${p.name} (available: ${p.stock})`);
      total += p.price * qty;
      lines.push({ id: p.id, qty, price: p.price });
    }
    const [o] = await conn.query('INSERT INTO orders (user_id,customer_name,total) VALUES (?,?,?)',
      [req.user.id, customer_name, total.toFixed(2)]);
    for (const l of lines) {
      await conn.query('INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)', [o.insertId, l.id, l.qty, l.price]);
      await conn.query('UPDATE products SET stock = stock - ? WHERE id=?', [l.qty, l.id]);
    }
    await conn.commit();
    res.status(201).json({ id: o.insertId, total });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.patch('/:id/cancel', wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query('SELECT * FROM orders WHERE id=? FOR UPDATE', [req.params.id]);
    if (!orders.length) throw new HttpError(404, 'Order not found');
    if (orders[0].status === 'cancelled') throw new HttpError(400, 'Order already cancelled');
    const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id=?', [req.params.id]);
    for (const i of items) await conn.query('UPDATE products SET stock = stock + ? WHERE id=?', [i.quantity, i.product_id]);
    await conn.query("UPDATE orders SET status='cancelled' WHERE id=?", [req.params.id]);
    await conn.commit();
    res.json({ message: 'Order cancelled and stock restored' });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

module.exports = router;
