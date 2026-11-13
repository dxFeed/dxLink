// Run with: node --test .github/scripts/release-notes.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReleaseNotes } from "./release-notes.mjs";

const build = (changelogs, version = "1.1.0") =>
  buildReleaseNotes(
    Object.keys(changelogs).map((name) => ({ name, path: name })),
    version,
    (pkg) => changelogs[pkg.name],
  );

test("lists a change released in several packages once, under its highest bump", () => {
  const notes = build({
    "@x/core": `# @x/core

## 1.1.0

### Minor Changes

- abc1234: Add a feature.

  With details.

## 1.0.0
`,
    "@x/api": `# @x/api

## 1.1.0

### Patch Changes

- abc1234: Add a feature.

  With details.
- Updated dependencies [abc1234]
  - @x/core@1.1.0
`,
  });

  assert.equal(
    notes,
    `## Minor Changes

- abc1234: Add a feature.

  With details.

  Packages: \`@x/api\`, \`@x/core\``,
  );
});

test("keys GitHub-format entries by their commit and drops shortened dependency lines", () => {
  const entry =
    "- [#51](https://github.com/o/r/pull/51) [`04ce473`](https://github.com/o/r/commit/04ce473) Thanks [@me](https://github.com/me)! - Fix it.";

  const notes = build({
    "@x/a": `## 1.1.0\n\n### Patch Changes\n\n${entry}\n- Updated dependencies:\n  - @x/b@1.1.0\n`,
    "@x/b": `## 1.1.0\n\n### Patch Changes\n\n${entry}\n`,
  });

  assert.equal(
    notes,
    `## Patch Changes\n\n${entry}\n\n  Packages: \`@x/a\`, \`@x/b\``,
  );
});

test("lists packages with only dependency updates or no changelog as released without changes", () => {
  const notes = build({
    "@x/a": "## 1.1.0\n\n### Minor Changes\n\n- abc1234: Change.\n",
    "@x/b":
      "## 1.1.0\n\n### Patch Changes\n\n- Updated dependencies [abc1234]\n  - @x/a@1.1.0\n",
    "@x/c": "",
  });

  assert.equal(
    notes,
    `## Minor Changes

- abc1234: Change.

  Packages: \`@x/a\`

## Released without changes

- \`@x/b\`
- \`@x/c\``,
  );
});

test("skips private packages and reports when nothing was found", () => {
  const notes = buildReleaseNotes(
    [{ name: "@x/root", path: ".", private: true }],
    "1.1.0",
    () => "## 1.1.0\n\n### Minor Changes\n\n- abc1234: Change.\n",
  );

  assert.equal(notes, "No changelog entries found for `1.1.0`.");
});
