import { existsSync, renameSync, rmSync } from 'node:fs';

// During `npm publish`, prepublishOnly creates a .publish-lock marking that
// package.json must stay stripped until postpublish — npm re-reads
// package.json at upload time (after postpack), so restoring in postpack
// would leave preinstall/postinstall in the published packument, which then
// runs on every consumer install and fails (simple-git-hooks/only-allow are
// devDependencies). Plain `npm pack` creates no lock and restores normally.
const publishLock = existsSync('.publish-lock');
const deferred = publishLock && !process.argv.includes('--now');

if (deferred) {
  console.log('[restore] publish in progress — deferring restore');
  process.exit(0);
}

if (publishLock) {
  rmSync('.publish-lock');
}

if (existsSync('package.json.backup')) {
  renameSync('package.json.backup', 'package.json');
  console.log('[restore] restored package.json');
}
