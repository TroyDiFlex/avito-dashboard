import fs from 'node:fs/promises';

await fs.writeFile('docs/.nojekyll', '');
await fs.copyFile('docs/index.html', 'docs/404.html');
