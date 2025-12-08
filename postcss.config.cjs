const removePropertyAtRule = () => ({
  postcssPlugin: 'remove-property-at-rule',
  AtRule(atRule) {
    if (atRule.name && atRule.name.toLowerCase() === 'property') {
      atRule.remove();
    }
  },
});

const basePlugins = [
  require('@tailwindcss/postcss'),
  require('autoprefixer'),
];

module.exports = () => {
  if (process.env.NODE_ENV === 'production') {
    return {
      plugins: [removePropertyAtRule(), ...basePlugins],
    };
  }
  return {
    plugins: basePlugins,
  };
};
