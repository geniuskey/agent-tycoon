/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

// 빌드 산출물에만 CSP를 삽입한다. (개발 서버는 HMR 인라인 스크립트가 필요)
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";
const cspPlugin = (): Plugin => ({
  name: 'agent-tycoon-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// 사내망/오프라인 배포를 위해 상대 경로(base: './')로 빌드한다.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin()],
  // tailscale serve 등 리버스 프록시(*.ts.net)로 접속 허용
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
