import tailwindcss from '@tailwindcss/vite';
import solidDevtools from 'solid-devtools/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import viteTsConfigPaths from 'vite-tsconfig-paths';

import { tanstackStart } from '@tanstack/solid-start/plugin/vite';

export default defineConfig({
  plugins: [
    solid({ ssr: true }),
    solidDevtools(),
    tailwindcss(),
    tanstackStart({
      customViteSolidPlugin: true,
      target: 'cloudflare-module',
    }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
});
