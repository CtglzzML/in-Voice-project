import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './test_ui.html',
        create_invoice: './pages/create_invoice.html'
      }
    }
  }
});
