const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function prepareTunnelHostname(projectRoot) {
  const settingsPath = path.join(projectRoot, '.expo', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Expo's base64url seed can contain underscores, which iOS rejects in hosts.
  const seed = settings.urlRandomness;
  if (typeof seed === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/i.test(seed)) {
    return false;
  }

  settings.urlRandomness = randomBytes(8).toString('hex');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

module.exports = { prepareTunnelHostname };

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  if (prepareTunnelHostname(projectRoot)) {
    console.log('Prepared an iPhone-compatible Expo tunnel hostname.');
  }
  const args = process.argv.slice(2);
  const expoCli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
  process.chdir(projectRoot);
  process.argv = [process.execPath, expoCli, 'start', ...args];
  require(expoCli);
}
