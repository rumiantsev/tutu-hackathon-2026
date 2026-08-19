const http = require('http');
const fs = require('fs');
const path = require('path');
const { computeBleisure } = require('./bleisure.js');
const { computeBleisure: computeBleisureQuiz } = require('../bleisure-quiz/bleisure.js');

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function queryOf(url) {
  return {
    origin: url.searchParams.get('origin'),
    destination: url.searchParams.get('destination'),
    depart: url.searchParams.get('depart'),
    ret: url.searchParams.get('ret'),
    adults: url.searchParams.get('adults')
  };
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/bleisure' || p === '/api/bleisure-quiz') {
    try {
      const data = p === '/api/bleisure-quiz'
        ? await computeBleisureQuiz(queryOf(url))
        : await computeBleisure(queryOf(url));
      send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8');
    } catch (e) {
      send(res, 500, JSON.stringify({ error: 'Внутренняя ошибка: ' + e.message }), 'application/json; charset=utf-8');
    }
    return;
  }

  let filePath = p === '/' ? '/bleisure-widget/demo.html' : p;
  const full = path.normalize(path.join(ROOT, filePath));
  if (!full.startsWith(ROOT)) { send(res, 403, 'Forbidden', 'text/plain'); return; }

  fs.readFile(full, function (err, buf) {
    if (err) { send(res, 404, 'Not found', 'text/plain; charset=utf-8'); return; }
    const ext = path.extname(full).toLowerCase();
    send(res, 200, buf, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT, function () {
  console.log('Bleisure server (unified, list + quiz): http://localhost:' + PORT);
});
