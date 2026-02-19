require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || 'rzp_webhook_secret123';
const payload = {
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_sim_' + Date.now(),
        order_id: 'order_sim_test_' + Date.now(),
        amount: 10000,
        currency: 'INR'
      }
    }
  }
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

const opts = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/payment/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'x-razorpay-signature': signature
  }
};

const req = http.request(opts, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', b);
  });
});
req.on('error', e => console.error('ERR', e));
req.write(body);
req.end();
