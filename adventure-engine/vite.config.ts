import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Pages serves the site from /<repo-name>/ for project sites and / for user/org
// or custom-domain sites. The deploy workflow passes the right value via
// BASE_PATH (sourced from actions/configure-pages); locally we default to /.
const rawBase = process.env.BASE_PATH ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  plugins: [vue()],
  base,
  server: {
    port: 5173,
  },
});
