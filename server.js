const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
// Load environment variables from .env if present
require('dotenv').config();
// Try to load Razorpay SDK (install with `npm install razorpay`)
let Razorpay;
try{ Razorpay = require('razorpay'); }catch(e){ Razorpay = null }

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';

// Ensure data directory exists (use Railway Volume path via DATA_DIR in production).
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) { console.error('dataDir', e); }

if (isProd) app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (req.path === '/api/payment/webhook') return next();
  return bodyParser.json()(req, res, next);
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
  }
}));

app.use(express.static(path.join(__dirname)));

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CARTS_FILE = path.join(DATA_DIR, 'carts.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const WISHLIST_FILE = path.join(DATA_DIR, 'wishlist.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const PROMOS_FILE = path.join(DATA_DIR, 'promos.json');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');

function loadJSON(file, fallback){ try{ return JSON.parse(fs.readFileSync(file,'utf8')) }catch(e){ return fallback }
}

let usersDb = loadJSON(USERS_FILE, { nextId: 2, users: { 'user@example.com': { id:1, email: 'user@example.com', password: 'password', name: 'Demo User', addresses: [] } } });
let cartsDb = loadJSON(CARTS_FILE, {});
let ordersDb = loadJSON(ORDERS_FILE, {});
let wishlistDb = loadJSON(WISHLIST_FILE, {});
let reviewsDb = loadJSON(REVIEWS_FILE, {});
let promosDb = loadJSON(PROMOS_FILE, { promos: [{ code: 'SAVE10', discount: 10, type: 'percent' }, { code: 'SAVE100', discount: 100, type: 'fixed' }] });
let emailsDb = loadJSON(EMAILS_FILE, []);

function saveUsers(){ try{ fs.writeFileSync(USERS_FILE, JSON.stringify(usersDb,null,2)) }catch(e){ console.error('saveUsers',e) } }
function saveCarts(){ try{ fs.writeFileSync(CARTS_FILE, JSON.stringify(cartsDb,null,2)) }catch(e){ console.error('saveCarts',e) } }
function saveOrders(){ try{ fs.writeFileSync(ORDERS_FILE, JSON.stringify(ordersDb,null,2)) }catch(e){ console.error('saveOrders',e) } }
function saveWishlist(){ try{ fs.writeFileSync(WISHLIST_FILE, JSON.stringify(wishlistDb,null,2)) }catch(e){ console.error('saveWishlist',e) } }
function saveReviews(){ try{ fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviewsDb,null,2)) }catch(e){ console.error('saveReviews',e) } }
function savePromos(){ try{ fs.writeFileSync(PROMOS_FILE, JSON.stringify(promosDb,null,2)) }catch(e){ console.error('savePromos',e) } }
function saveEmails(){ try{ fs.writeFileSync(EMAILS_FILE, JSON.stringify(emailsDb,null,2)) }catch(e){ console.error('saveEmails',e) } }

function sendEmail(to, subject, body){
  // Simple email stub: persist to emails.json
  const email = { id: 'email_' + Date.now(), to, subject, body, createdAt: Date.now() };
  emailsDb.push(email);
  saveEmails();
  console.log('Email queued to', to, subject);
}

function getCart(req){
  if (req.session.user){
    const uid = String(req.session.user.id);
    if (!cartsDb[uid]) cartsDb[uid] = {};
    req.session.cart = cartsDb[uid];
    return req.session.cart;
  }
  if (!req.session.cart) req.session.cart = {};
  return req.session.cart;
}

// Ensure any plaintext passwords are migrated to hashed passwords on startup
(() => {
  let changed = false;
  Object.keys(usersDb.users).forEach(email => {
    const u = usersDb.users[email];
    if (!u.password || typeof u.password !== 'string') return;
    // bcrypt hashes start with $2a$ or $2b$ or $2y$
    if (!/^\$2[aby]\$/.test(u.password)){
      const hashed = bcrypt.hashSync(u.password, 10);
      usersDb.users[email].password = hashed;
      changed = true;
    }
  });
  if (changed) saveUsers();
})();

app.post('/api/signin', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  const u = usersDb.users[email];
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  // verify bcrypt hash
  if (!bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { id: u.id, email: u.email, name: u.name };
  // merge session cart into persistent cart
  const sessCart = req.session.cart || {};
  const uid = String(u.id);
  if (!cartsDb[uid]) cartsDb[uid] = {};
  Object.keys(sessCart).forEach(k=>{
    if (cartsDb[uid][k]) cartsDb[uid][k].qty += sessCart[k].qty;
    else cartsDb[uid][k] = sessCart[k];
  });
  saveCarts();
  req.session.cart = cartsDb[uid];
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/signout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'failed' });
    res.json({ ok: true });
  });
});

app.get('/api/account', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  res.json({ user: req.session.user });
});

app.get('/api/cart', (req, res) => {
  const cart = getCart(req);
  res.json(Object.values(cart));
});

app.post('/api/cart/add', (req, res) => {
  const { id, title, price, qty } = req.body;
  if (typeof id === 'undefined') return res.status(400).json({ error: 'id required' });
  const cart = getCart(req);
  const key = String(id);
  const q = parseInt(qty) || 1;
  if (cart[key]) cart[key].qty += q;
  else cart[key] = { id, title, price: Number(price) || 0, qty: q };
  // persist if signed-in
  if (req.session.user){ cartsDb[String(req.session.user.id)] = cart; saveCarts(); }
  res.json(Object.values(cart));
});

app.post('/api/cart/update', (req, res) => {
  const { id, qty } = req.body;
  if (typeof id === 'undefined') return res.status(400).json({ error: 'id required' });
  const cart = getCart(req);
  const key = String(id);
  if (!cart[key]) return res.status(404).json({ error: 'not found' });
  const q = parseInt(qty) || 0;
  if (q <= 0) delete cart[key];
  else cart[key].qty = q;
  if (req.session.user){ cartsDb[String(req.session.user.id)] = cart; saveCarts(); }
  res.json(Object.values(cart));
});

app.post('/api/cart/remove', (req, res) => {
  const { id } = req.body;
  if (typeof id === 'undefined') return res.status(400).json({ error: 'id required' });
  const cart = getCart(req);
  delete cart[String(id)];
  if (req.session.user){ cartsDb[String(req.session.user.id)] = cart; saveCarts(); }
  res.json(Object.values(cart));
});

app.post('/api/cart/clear', (req, res) => {
  if (req.session.user){ cartsDb[String(req.session.user.id)] = {}; saveCarts(); req.session.cart = {}; }
  else { req.session.cart = {}; }
  res.json([]);
});

// Signup endpoint
app.post('/api/signup', (req, res) => {
  let { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!name) name = String(email).split('@')[0] || 'User';
  if (usersDb.users[email]){
    console.log('signup attempt - email exists:', email);
    return res.status(409).json({ error: 'email already registered' });
  }
  const id = usersDb.nextId++;
  const hashed = bcrypt.hashSync(password, 10);
  usersDb.users[email] = { id, email, password: hashed, name, addresses: [], phone: '', darkMode: false };
  saveUsers();
  console.log('signup success:', email, 'id=', id);
  cartsDb[String(id)] = cartsDb[String(id)] || {};
  wishlistDb[String(id)] = wishlistDb[String(id)] || [];
  saveCarts();
  saveWishlist();
  req.session.user = { id, email, name };
  req.session.cart = cartsDb[String(id)];
  res.json({ ok: true, user: req.session.user });
});

// Wishlist endpoints
app.get('/api/wishlist', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const uid = String(req.session.user.id);
  res.json(wishlistDb[uid] || []);
});

app.post('/api/wishlist/add', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { id, title, price, img } = req.body;
  const uid = String(req.session.user.id);
  if (!wishlistDb[uid]) wishlistDb[uid] = [];
  if (!wishlistDb[uid].find(p => p.id === id)) {
    wishlistDb[uid].push({ id, title, price, img, addedAt: Date.now() });
    saveWishlist();
  }
  res.json(wishlistDb[uid]);
});

app.post('/api/wishlist/remove', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { id } = req.body;
  const uid = String(req.session.user.id);
  if (wishlistDb[uid]) {
    wishlistDb[uid] = wishlistDb[uid].filter(p => p.id !== id);
    saveWishlist();
  }
  res.json(wishlistDb[uid] || []);
});

// Reviews endpoints
app.get('/api/reviews/:productId', (req, res) => {
  const { productId } = req.params;
  res.json(reviewsDb[productId] || []);
});

app.post('/api/reviews/add', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { productId, title, rating, comment } = req.body;
  if (!reviewsDb[productId]) reviewsDb[productId] = [];
  reviewsDb[productId].push({
    id: Date.now(),
    userId: req.session.user.id,
    userName: req.session.user.name,
    rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
    title,
    comment,
    createdAt: Date.now(),
    helpful: 0
  });
  saveReviews();
  res.json(reviewsDb[productId]);
});

// Promo code endpoints
app.post('/api/promo/validate', (req, res) => {
  const { code } = req.body;
  const promo = promosDb.promos.find(p => p.code.toUpperCase() === code.toUpperCase());
  if (!promo) return res.status(404).json({ error: 'Invalid promo code' });
  res.json(promo);
});

// User address endpoints
app.get('/api/user/addresses', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const email = req.session.user.email;
  const user = usersDb.users[email];
  res.json(user.addresses || []);
});

app.post('/api/user/address/add', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { name, phone, street, city, state, zip } = req.body;
  const email = req.session.user.email;
  if (!usersDb.users[email].addresses) usersDb.users[email].addresses = [];
  usersDb.users[email].addresses.push({
    id: Date.now(),
    name, phone, street, city, state, zip,
    createdAt: new Date().toISOString()
  });
  saveUsers();
  res.json(usersDb.users[email].addresses);
});

app.post('/api/user/address/delete', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { addressId } = req.body;
  const email = req.session.user.email;
  usersDb.users[email].addresses = usersDb.users[email].addresses.filter(a => a.id != addressId);
  saveUsers();
  res.json(usersDb.users[email].addresses);
});

// Update user settings
app.post('/api/user/settings', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { phone, darkMode } = req.body;
  const email = req.session.user.email;
  if (phone !== undefined) usersDb.users[email].phone = phone;
  if (darkMode !== undefined) usersDb.users[email].darkMode = darkMode;
  saveUsers();
  res.json({ ok: true });
});

// Orders endpoints
app.get('/api/orders', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const uid = String(req.session.user.id);
  const userOrders = ordersDb[uid] || [];
  res.json(userOrders.sort((a, b) => b.createdAt - a.createdAt));
});

app.post('/api/orders/create', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'not-authenticated' });
  const { items, totalAmount, shippingAddress, promoCode } = req.body;
  const uid = String(req.session.user.id);
  const orderId = 'ORD-' + Date.now();
  
  const order = {
    id: orderId,
    userId: req.session.user.id,
    items,
    totalAmount,
    shippingAddress,
    promoCode: promoCode || null,
    status: 'confirmed',
    paymentStatus: 'pending',
    createdAt: Date.now(),
    estimatedDelivery: Date.now() + (5 * 24 * 60 * 60 * 1000)
  };
  
  if (!ordersDb[uid]) ordersDb[uid] = [];
  ordersDb[uid].push(order);
  saveOrders();
  
  res.json(order);
});

// Admin endpoints
app.get('/api/admin/stats', (req, res) => {
  // Check if admin (hardcoded for demo)
  if (!req.session.user || req.session.user.email !== 'admin@example.com') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  let totalOrders = 0, totalRevenue = 0, totalUsers = 0;
  Object.keys(ordersDb).forEach(uid => {
    const userOrders = ordersDb[uid];
    totalOrders += userOrders.length;
    userOrders.forEach(o => totalRevenue += o.totalAmount);
  });
  totalUsers = Object.keys(usersDb.users).length;
  
  res.json({
    totalOrders,
    totalRevenue,
    totalUsers,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
  });
});

app.get('/api/admin/orders', (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@example.com') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const allOrders = [];
  Object.keys(ordersDb).forEach(uid => {
    ordersDb[uid].forEach(o => allOrders.push({ ...o, userName: Object.keys(usersDb.users).find(e => usersDb.users[e].id == o.userId) }));
  });
  
  res.json(allOrders.sort((a, b) => b.createdAt - a.createdAt));
});

app.post('/api/admin/order/status', (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@example.com') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const { orderId, status } = req.body;
  let found = false;
  
  Object.keys(ordersDb).forEach(uid => {
    const order = ordersDb[uid].find(o => o.id === orderId);
    if (order) {
      order.status = status;
      found = true;
    }
  });
  
  if (found) saveOrders();
  res.json({ ok: found });
});

// Payment endpoints
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// Return public key id to frontend
app.get('/api/payment/key', (req, res) => {
  res.json({ key_id: RAZORPAY_KEY_ID });
});

app.post('/api/payment/create-order', async (req, res) => {
  const { amount, items } = req.body; // amount expected in paise (integer)
  const amountPaise = parseInt(amount, 10);
  if (!amountPaise || amountPaise <= 0) {
    return res.status(400).json({ error: 'valid amount required' });
  }

  if (!Razorpay) {
    return res.status(500).json({ error: 'Razorpay SDK not available on server' });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay keys not configured' });
  }

  try {
    const rzp = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: 'rcpt_' + Date.now(),
      payment_capture: 1
    };
    const order = await rzp.orders.create(options);
    if (!global.orders) global.orders = {};
    global.orders[order.id] = { id: order.id, amount: order.amount, items, status: 'created', createdAt: Date.now() };
    return res.json({ id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    const reason = (err && err.error && (err.error.description || err.error.reason)) || err.message || 'unknown error';
    console.error('razorpay.create', reason, err && err.error ? err.error : err);
    return res.status(502).json({ error: 'Failed to create Razorpay order', details: reason });
  }
});

// Webhook endpoint — verify signature using raw body
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET;
  if (!Buffer.isBuffer(req.body)) {
    console.warn('webhook raw body missing');
    return res.status(400).send('invalid body');
  }
  const body = req.body.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (expected !== signature) {
    console.warn('webhook signature mismatch');
    return res.status(400).send('invalid signature');
  }
  let payload;
  try { payload = JSON.parse(body); } catch(e){ return res.status(400).send('invalid json'); }

  // Minimal event handling: mark order completed on payment.captured
  try {
    const event = payload.event;
    const data = payload.payload || {};
    if (event === 'payment.captured') {
      const payment = data.payment && (data.payment.entity || data.payment);
      const orderId = payment && payment.order_id;
      if (orderId && global.orders && global.orders[orderId]) {
        global.orders[orderId].status = 'completed';
        global.orders[orderId].payment = payment;
      }
    }
  } catch (e) { console.error('webhook.handle', e); }

  res.json({ ok: true });
});

app.post('/api/payment/verify', (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details' });
  }
  
  // Verify signature (HMAC SHA256)
  const message = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(message)
    .digest('hex');
  
  if (expectedSignature === razorpay_signature) {
    // Payment verified successfully
    if (global.orders && global.orders[razorpay_order_id]) {
      global.orders[razorpay_order_id].status = 'completed';
      global.orders[razorpay_order_id].paymentId = razorpay_payment_id;
    }

    // If user is signed in, record a persistent order and clear cart
    if (req.session.user) {
      try {
        const uid = String(req.session.user.id);
        const src = (global.orders && global.orders[razorpay_order_id]) || {};
        const items = src.items || Object.values(req.session.cart || {});
        let totalAmount = 0;
        if (Array.isArray(items) && items.length) {
          totalAmount = items.reduce((s,i)=> s + (i.price||0) * (i.qty||1), 0);
        } else if (src.amount) {
          // if amount stored in paise, convert
          totalAmount = Number(src.amount) / 100;
        }

        const newOrderId = 'ORD-' + Date.now();
        const order = {
          id: newOrderId,
          userId: req.session.user.id,
          items,
          totalAmount,
          shippingAddress: null,
          promoCode: null,
          status: 'confirmed',
          paymentStatus: 'completed',
          paymentProviderOrderId: razorpay_order_id,
          paymentProviderPaymentId: razorpay_payment_id,
          createdAt: Date.now(),
          estimatedDelivery: Date.now() + (5 * 24 * 60 * 60 * 1000)
        };

        if (!ordersDb[uid]) ordersDb[uid] = [];
        ordersDb[uid].push(order);
        saveOrders();

        // clear user's cart
        cartsDb[uid] = {};
        saveCarts();
        req.session.cart = {};

        // queue email notification
        const emailBody = `Thank you for your order ${newOrderId}\n\nItems:\n${(items||[]).map(i=>`- ${i.title} x${i.qty||1} — ₹${i.price}`).join('\n')}\n\nTotal: ₹${totalAmount}`;
        sendEmail(req.session.user.email, `Order confirmation ${newOrderId}`, emailBody);

        console.log('Order recorded for user', req.session.user.email, newOrderId);
        return res.json({ ok: true, orderId: newOrderId });
      } catch (err) {
        console.error('order-record', err);
      }
    }

    console.log('Payment verified:', razorpay_payment_id);
    return res.json({ ok: true, orderId: razorpay_order_id });
  } else {
    res.status(403).json({ error: 'Payment verification failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

