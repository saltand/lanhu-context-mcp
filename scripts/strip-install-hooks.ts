import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// Idempotent: if a backup already exists (e.g. prepublishOnly ran first,
// prepack runs again), keep the ORIGINAL backup and just re-strip scripts.
if (!existsSync('package.json.backup')) {
  copyFileSync('package.json', 'package.json.backup');
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
delete pkg.scripts.preinstall;
delete pkg.scripts.postinstall;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

console.log('[strip] removed install hooks');

// With --publish: keep package.json stripped until postpublish so the
// manifest uploaded to the registry is also clean. npm reads package.json
// at upload time, not at pack time — restoring in postpack alone leaves
// preinstall/postinstall in the published packument (they then run on
// every consumer install and fail: simple-git-hooks/only-allow are devDeps).
if (process.argv.includes('--publish')) {
  writeFileSync('.publish-lock', '');
  console.log('[strip] publish lock created — restore deferred to postpublish');
}
