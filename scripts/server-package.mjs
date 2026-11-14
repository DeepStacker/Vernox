// Writes dist-server/package.json listing only the packages the bundled server imports at runtime (from the esbuild
// metafile), with the versions pinned in package-lock.json. The Docker runtime image installs these instead of every
// production dependency of the storefront (3D viewer, PDF and editor libraries), which the server never loads.
//
//   node scripts/server-package.mjs dist-server/meta.json
import { readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

const [metafilePath] = process.argv.slice(2);
if (!metafilePath) {
  console.error('usage: node scripts/server-package.mjs <esbuild metafile>');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(metafilePath, 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const builtins = new Set(builtinModules);

const packageName = spec => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

const names = new Set();
for (const output of Object.values(meta.outputs)) {
  for (const imp of output.imports ?? []) {
    if (!imp.external || imp.path.startsWith('node:') || imp.path.startsWith('.')) continue;
    const name = packageName(imp.path);
    if (!builtins.has(name)) names.add(name);
  }
}

const dependencies = {};
for (const name of [...names].sort()) {
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  const declared = pkg.dependencies?.[name];
  if (!locked && !declared) {
    console.error(`server imports ${name}, which is not a dependency in package.json`);
    process.exit(1);
  }
  if (!declared) console.error(`warning: server imports ${name} without declaring it; using the locked ${locked}`);
  dependencies[name] = locked ?? declared;
}

writeFileSync(
  'dist-server/package.json',
  `${JSON.stringify({ name: 'vernox-server', private: true, type: pkg.type, dependencies }, null, 2)}\n`,
);
console.log(`dist-server/package.json: ${Object.keys(dependencies).length} runtime packages (${Object.keys(dependencies).join(', ')})`);
