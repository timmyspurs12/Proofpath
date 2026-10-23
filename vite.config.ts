import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const contentSecurityPolicy =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': contentSecurityPolicy,
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    headers: {
      ...securityHeaders,
      // React refresh uses an inline preamble and HMR uses WebSockets in development only.
      'Content-Security-Policy': contentSecurityPolicy
        .replace("connect-src 'self'", "connect-src 'self' ws: wss:")
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    sourcemap: true,
  },
});
