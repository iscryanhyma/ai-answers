const { createProxyMiddleware } = require('http-proxy-middleware');

// CRA will automatically load this file when running `npm start`.
// Proxy all /api requests to the backend server running on localhost:3001
// and rewrite cookie domains so cookies set by the backend are accepted
// by the browser during local development.

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      secure: false,
      // Remove Domain attribute so cookies set by backend can be stored by the browser
      cookieDomainRewrite: 'localhost',
      onProxyRes: (proxyRes, req, res) => {
        // Some backends set a Domain on the cookie which prevents the browser
        // from accepting it in some dev setups. Strip any Domain attribute.
        const setCookie = proxyRes.headers['set-cookie'];
        if (setCookie && Array.isArray(setCookie)) {
          proxyRes.headers['set-cookie'] = setCookie.map((c) => c.replace(/;?\s*Domain=[^;]+/i, ''));
        }
      },
      logLevel: 'warn',
    })
  );
};
