const http = require('http');
const data = JSON.stringify({ amount: 10000, items: [] });
const opts = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/payment/create-order',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
};

const req = http.request(opts, res => {
  console.log('STATUS', res.statusCode);
  console.log('HEADERS', res.headers);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('BODY', body);
    try { console.log('PARSED', JSON.parse(body)); } catch(e) { /* ignore */ }
  });
});

req.on('error', err => {
  console.error('REQUEST ERROR', err);
});

req.write(data);
req.end();
