const fs = require('node:fs');
const path = require('node:path');

// Source-level regressions follow the modular app without loading Expo. Keep
// existing assertions and handler execution independent of physical file layout.
function nativeAppSource(root) {
  const mobile = path.join(root, 'mobile');
  const files = ['App.tsx'];
  for (const directory of ['hooks', 'screens', 'components', 'utils']) {
    const visit = relative => {
      for (const entry of fs.readdirSync(path.join(mobile, relative), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(relative, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.tsx?$/.test(file)) files.push(file);
      }
    };
    visit(directory);
  }
  return files.map(file => fs.readFileSync(path.join(mobile, file), 'utf8')).join('\n');
}

module.exports = {nativeAppSource};
