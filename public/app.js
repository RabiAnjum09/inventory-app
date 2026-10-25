const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mode = 'login';
let products = [];
let cart = [];

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); throw new Error(data.error || 'Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function flash(text, ok = true) {
  const m = $('#msg');
  m.className = ok ? 'ok' : 'error';
  m.textContent = text;
  setTimeout(() => m.classList.add('hidden'), 3500);
}

// ---------- Auth ----------
function setMode(m) {
  mode = m;
  $('#tab-login').classList.toggle('active', m === 'login');
  $('#tab-register').classList.toggle('active', m === 'register');
  $('#name').classList.toggle('hidden', m === 'login');
  $('#auth-submit').textContent = m === 'login' ? 'Login' : 'Create account';
  $('#auth-error').classList.add('hidden');
}
$('#tab-login').onclick = () => setMode('login');
$('#tab-register').onclick = () => setMode('register');

$('#auth-submit').onclick = async () => {
  try {
    const body = { email: $('#email').value.trim(), password: $('#password').value };
    if (mode === 'register') body.name = $('#name').value.trim();
    const d = await api(mode === 'login' ? '/auth/login' : '/auth/register', 'POST', body);
    token = d.token; user = d.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    showApp();
  } catch (e) {
    const el = $('#auth-error');
    el.textContent = e.message;
    el.classList.remove('hidden');
  }
};

function logout() {
  token = null; user = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
}
$('#logout').onclick = logout;

function showApp() {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#who').textContent = `${user.name} (${user.role})`;
  show('dashboard');
}

// ---------- Navigation ----------
function show(view) {
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ({ dashboard: loadDashboard, products: loadProducts, orders: loadOrders, users: loadUsers })[view]()
    .catch(e => flash(e.message, false));
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => show(b.dataset.view));

// ---------- Dashboard ----------
async function loadDashboard() {
  const s = await api('/orders/stats');
  $('#stats').innerHTML = [
    ['Products', s.products], ['Units in stock', s.units],
    ['Inventory value', money(s.value)], ['Completed orders', s.orders], ['Revenue', money(s.revenue)]
  ].map(([k, v]) => `<div class="stat">${k}<b>${esc(v)}</b></div>`).join('');
  $('#low-table tbody').innerHTML = s.lowStock.length
    ? s.lowStock.map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${p.stock}</td></tr>`).join('')
    : '<tr><td colspan="3">No low-stock items</td></tr>';
}

// ---------- Products ----------
async function loadProducts() {
  const q = $('#search').value.trim();
  products = await api('/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
  $('#product-table tbody').innerHTML = products.map(p => `
    <tr><td>${p.id}</td><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td>
    <td>${money(p.price)}</td><td>${p.stock}</td>
    <td><button class="btn small" onclick="editProduct(${p.id})">Edit</button>
    ${user.role === 'admin' ? `<button class="btn small danger" onclick="deleteProduct(${p.id})">Delete</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="7">No products found</td></tr>';
}
$('#search').oninput = () => loadProducts().catch(e => flash(e.message, false));

function openProductForm(p) {
  $('#product-form').classList.remove('hidden');
  $('#p-id').value = p?.id || '';
  $('#p-name').value = p?.name || '';
  $('#p-sku').value = p?.sku || '';
  $('#p-category').value = p?.category || '';
  $('#p-price').value = p?.price ?? '';
  $('#p-stock').value = p?.stock ?? '';
}
$('#btn-add-product').onclick = () => openProductForm();
$('#p-cancel').onclick = () => $('#product-form').classList.add('hidden');
window.editProduct = id => openProductForm(products.find(p => p.id === id));
window.deleteProduct = async id => {
  if (!confirm('Delete this product?')) return;
  try { await api('/products/' + id, 'DELETE'); flash('Product deleted'); loadProducts(); }
  catch (e) { flash(e.message, false); }
};
$('#product-form').onsubmit = async ev => {
  ev.preventDefault();
  const body = {
    name: $('#p-name').value.trim(), sku: $('#p-sku').value.trim(),
    category: $('#p-category').value.trim() || 'General',
    price: $('#p-price').value, stock: $('#p-stock').value
  };
  const id = $('#p-id').value;
  try {
    await api(id ? '/products/' + id : '/products', id ? 'PUT' : 'POST', body);
    $('#product-form').classList.add('hidden');
    flash(id ? 'Product updated' : 'Product added');
    loadProducts();
  } catch (e) { flash(e.message, false); }
};

// ---------- Orders ----------
async function loadOrders() {
  products = await api('/products');
  $('#o-product').innerHTML = products.map(p =>
    `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)}) - ${money(p.price)} - stock ${p.stock}</option>`).join('');
  renderCart();
  const orders = await api('/orders');
  $('#order-table tbody').innerHTML = orders.map(o => `
    <tr><td>${o.id}</td><td>${esc(o.customer_name)}</td><td>${esc(o.staff_name)}</td><td>${money(o.total)}</td>
    <td><span class="badge ${o.status}">${o.status}</span></td><td>${new Date(o.created_at).toLocaleString()}</td>
    <td><button class="btn small secondary" onclick="viewOrder(${o.id})">View</button>
    ${o.status === 'completed' ? `<button class="btn small danger" onclick="cancelOrder(${o.id})">Cancel</button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="7">No orders yet</td></tr>';
}

function renderCart() {
  $('#cart-table tbody').innerHTML = cart.map((c, i) =>
    `<tr><td>${esc(c.name)}</td><td>${c.quantity}</td><td>${money(c.price * c.quantity)}</td>
     <td><button class="btn small danger" onclick="removeItem(${i})">x</button></td></tr>`).join('');
  $('#cart-total').textContent = money(cart.reduce((s, c) => s + c.price * c.quantity, 0));
}
window.removeItem = i => { cart.splice(i, 1); renderCart(); };

$('#o-add').onclick = () => {
  const p = products.find(x => x.id === Number($('#o-product').value));
  const qty = parseInt($('#o-qty').value, 10);
  if (!p || !(qty > 0)) return flash('Choose a product and a valid quantity', false);
  const existing = cart.find(c => c.product_id === p.id);
  if (existing) existing.quantity += qty;
  else cart.push({ product_id: p.id, name: p.name, price: p.price, quantity: qty });
  renderCart();
};

$('#o-place').onclick = async () => {
  try {
    await api('/orders', 'POST', {
      customer_name: $('#o-customer').value.trim(),
      items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity }))
    });
    cart = []; $('#o-customer').value = '';
    flash('Order placed');
    loadOrders();
  } catch (e) { flash(e.message, false); }
};

window.viewOrder = async id => {
  const o = await api('/orders/' + id);
  const pre = $('#order-detail');
  pre.classList.remove('hidden');
  pre.textContent = `Order #${o.id} | ${o.customer_name} | ${o.status}\n` +
    o.items.map(i => ` - ${i.name} (${i.sku}) x ${i.quantity} @ ${money(i.unit_price)}`).join('\n') +
    `\nTotal: ${money(o.total)}`;
};
window.cancelOrder = async id => {
  if (!confirm('Cancel this order and restore stock?')) return;
  try { await api(`/orders/${id}/cancel`, 'PATCH'); flash('Order cancelled'); loadOrders(); }
  catch (e) { flash(e.message, false); }
};

// ---------- Users ----------
async function loadUsers() {
  const users = await api('/auth/users');
  $('#user-table tbody').innerHTML = users.map(u =>
    `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${new Date(u.created_at).toLocaleString()}</td></tr>`).join('');
}

// ---------- Boot ----------
if (token && user) showApp();
