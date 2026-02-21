/**
 * local-server.js — Minimal HTTP server for local testing
 *
 * Usage: node scripts/local-server.js
 * Then visit: http://localhost:3000/api/wallpaper?model=iphone16pro
 */

const http  = require('http');
const { URL } = require('url');

const handler = require('../api/wallpaper');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (!url.pathname.startsWith('/api/wallpaper')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Build a minimal req/res interface matching what Vercel provides
  req.query = Object.fromEntries(url.searchParams.entries());

  handler(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Local wallpaper server running at http://localhost:${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/api/wallpaper?model=iphone16pro`);
});
