/**
 * Lightning CSS downlevels oklch / color-mix / modern color functions
 * so Tailwind v4 output remains usable on Chrome 100–110 (Win7 last builds).
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-lightningcss": {
      // Chrome 100 ≈ last usable class on older Windows deployments
      targets: {
        chrome: (100 << 16),
        firefox: (100 << 16),
        safari: (15 << 16),
        edge: (100 << 16),
      },
      drafts: {
        customMedia: true,
      },
      // Keep CSS readable in dev; minify happens in Next production pipeline
      minify: process.env.NODE_ENV === "production",
    },
  },
};

export default config;
