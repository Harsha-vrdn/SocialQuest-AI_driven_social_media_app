const path = require('node:path');
require('esbuild').buildSync({
  entryPoints: [path.resolve(__dirname, '../browserAttachments.ts')],
  outfile: path.resolve(__dirname, '../../web/static/chat-attachments.js'),
  bundle: true, platform: 'browser', format: 'iife', target: ['es2020'],
  legalComments: 'eof',
});
