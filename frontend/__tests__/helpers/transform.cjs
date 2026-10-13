const babel = require('@babel/core');

// Vite provides import.meta.env and import.meta.glob; Jest does not, so swap them for plain values.
module.exports = {
  process(source, filename) {
    const code = source
      .replace(/import\.meta\.env\.PROD/g, 'false')
      .replace(/import\.meta\.env\.VITE_CHAT_SERVER_URL/g, 'undefined')
      .replace(/import\.meta\.glob\([^)]*\)/g, '({})');
    const result = babel.transformSync(code, {
      filename,
      babelrc: false,
      configFile: false,
      presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    });
    return { code: result.code };
  },
};
