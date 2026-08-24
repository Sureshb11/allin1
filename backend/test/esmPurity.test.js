// The backend is `"type": "module"` — every .js file under src/ is ESM, where
// `require` and `module` simply do not exist.
//
// Mixing in CommonJS is not a style problem here, it is a runtime failure, and a
// quiet one. `src/lib/sports.js` exported with `module.exports` while five call
// sites pulled it in with an inline `require('../lib/sports')`. Nothing broke at
// boot and nothing broke at import, so the endpoints looked healthy — a
// malformed request still came back with a proper validation error, because the
// bad line sat AFTER schema parsing. Only a well-formed request reached it, threw
// `ReferenceError: require is not defined`, and was swallowed by the route's own
// try/catch into a generic 400. In the app that surfaced as a Post button that
// did nothing at all. It broke every post, match and tournament write.
//
// Two cheap guards, since neither eslint nor the existing suites caught it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sourceFiles(dir = SRC) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Comment lines are exempt: prose about `require` is fine, calling it is not.
const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

describe('ESM purity', () => {
  test('no CommonJS syntax anywhere under src/', () => {
    const offenders = [];
    const patterns = [
      [/\brequire\s*\(/, 'require('],
      [/\bmodule\.exports\b/, 'module.exports'],
      [/^\s*exports\.[A-Za-z_$]/, 'exports.x ='],
      [/\b__dirname\b/, '__dirname'],
      [/\b__filename\b/, '__filename'],
    ];
    for (const file of sourceFiles()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (isComment(line)) return;
        for (const [re, label] of patterns) {
          if (re.test(line)) {
            offenders.push(`${path.relative(SRC, file)}:${i + 1}  ${label}`);
          }
        }
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `CommonJS in an ESM package — these throw at runtime, not at boot:\n${offenders.join('\n')}`,
    );
  });

  test('every lib and route module imports cleanly', async () => {
    // index.js is skipped on purpose: importing it starts the HTTP server.
    const modules = sourceFiles().filter((f) => {
      const rel = path.relative(SRC, f);
      return rel.startsWith('lib') || rel.startsWith('routes');
    });
    assert.ok(modules.length > 0, 'expected to find lib/route modules');

    const failed = [];
    for (const file of modules) {
      try {
        await import(pathToFileURL(file).href);
      } catch (err) {
        failed.push(`${path.relative(SRC, file)}: ${err.message.split('\n')[0]}`);
      }
    }
    assert.deepEqual(failed, [], `modules that fail to import:\n${failed.join('\n')}`);
  });
});
