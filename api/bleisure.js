const { computeBleisure } = require('../bleisure-widget/bleisure.js');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    const data = await computeBleisure({
      origin: url.searchParams.get('origin'),
      destination: url.searchParams.get('destination'),
      depart: url.searchParams.get('depart'),
      ret: url.searchParams.get('ret'),
      leisure: url.searchParams.get('leisure'),
      adults: url.searchParams.get('adults')
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Внутренняя ошибка: ' + e.message }));
  }
};
