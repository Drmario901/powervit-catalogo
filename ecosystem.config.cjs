/**
 * PM2 ecosystem file para MJE Catálogo (Astro SSR con Node adapter)
 *
 * Uso:
 *   1. pnpm build
 *   2. pm2 start ecosystem.config.cjs
 *
 * Puerto: 5000 (variable PORT)
 */
module.exports = {
  apps: [
    {
      name: 'catalogo-mjeimports',
      script: './dist/server/entry.mjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
