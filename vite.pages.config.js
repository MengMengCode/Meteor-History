import { defineConfig } from 'vite';

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const requestedBase = process.env.PAGES_BASE_PATH || (repositoryName ? `/${repositoryName}/` : '/');
  const base = requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`;
  return {
    root: 'site',
    base,
    publicDir: false,
    build: {
      outDir: '../pages-dist',
      emptyOutDir: true,
    },
  };
});
