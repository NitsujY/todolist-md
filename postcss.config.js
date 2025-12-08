import tailwind from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

// Small production-only plugin to remove `@property` at-rules which
// some CSS optimizers (LightningCSS) flag as unknown and emit warnings.
const removePropertyAtRule = () => ({
  postcssPlugin: 'remove-property-at-rule',
  AtRule(atRule) {
    if (atRule.name && atRule.name.toLowerCase() === 'property') {
      atRule.remove();
    }
  },
});

export default {
  plugins: [
    process.env.NODE_ENV === 'production' && removePropertyAtRule(),
    tailwind,
    autoprefixer,
  ].filter(Boolean),
}
