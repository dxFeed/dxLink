// Builds the GitHub Release body from the `## <version>` section of each published package's
// CHANGELOG.md.
//
// All packages are released together (one `fixed` changesets group), and a changeset that touches
// several packages is written into each of their changelogs. Listed per package, the same change
// would repeat once per package, so changes are merged instead: each appears once, under its
// highest bump type, followed by the packages it was released in. "Updated dependencies" entries
// are left out: in a fixed group every package bumps its internal dependencies on every release.
// Packages with no change of their own share one trailing list.
//
// Usage: pnpm ls -r --depth -1 --json | node release-notes.mjs 1.2.3

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUMP_TYPES = ["Major", "Minor", "Patch"];

/** Extract the body of the `## <version>` section from a changelog. */
export const sectionFor = (changelog, version) => {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);

  if (start === -1) return "";

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));

  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
};

/**
 * Split a version section into its entries: `{ bump, text }`, where `bump` is the `### <Bump> Changes`
 * heading the entry is under and `text` is the top-level list item with its continuation lines.
 */
export const entriesOf = (section) => {
  const entries = [];
  let bump;
  let current;

  for (const line of section.split("\n")) {
    const heading = line.match(/^### (\w+) Changes\s*$/);

    if (heading) {
      bump = heading[1];
      current = undefined;
    } else if (line.startsWith("- ")) {
      current = { bump, lines: [line] };
      entries.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  return entries.map(({ bump, lines }) => ({
    bump,
    text: lines.join("\n").trimEnd(),
  }));
};

const isDependencyUpdate = (text) => text.startsWith("- Updated dependencies");

/**
 * The key that identifies one changeset across changelogs: the commit that added it, in either the
 * default format (`- abc1234: summary`) or the GitHub one (`` [`abc1234`](…/commit/…) ``),
 * falling back to the entry text.
 */
const keyOf = (text) =>
  text.match(/^- ([0-9a-f]{7,40}):/)?.[1] ??
  text.match(/\[`([0-9a-f]{7,40})`\]/)?.[1] ??
  text;

const rank = (bump) => {
  const index = BUMP_TYPES.indexOf(bump);

  return index === -1 ? BUMP_TYPES.length : index;
};

/**
 * Build the release notes.
 * @param packages `{ name, path, private }` objects, as `pnpm ls --json` prints them.
 * @param version The released version.
 * @param readChangelog Reads a package's CHANGELOG.md, or returns '' when it has none.
 */
export const buildReleaseNotes = (packages, version, readChangelog) => {
  const changes = new Map();
  const withoutChanges = [];

  const published = packages
    .filter((pkg) => !pkg.private)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const pkg of published) {
    const entries = entriesOf(sectionFor(readChangelog(pkg), version)).filter(
      ({ text }) => !isDependencyUpdate(text),
    );

    if (entries.length === 0) {
      withoutChanges.push(pkg.name);
      continue;
    }

    for (const { bump, text } of entries) {
      const key = keyOf(text);
      const change = changes.get(key);

      if (change === undefined) {
        changes.set(key, { bump, text, packages: [pkg.name] });
      } else {
        if (rank(bump) < rank(change.bump)) change.bump = bump;
        change.packages.push(pkg.name);
      }
    }
  }

  const body = [];
  const all = [...changes.values()];

  for (const bump of [...BUMP_TYPES, undefined]) {
    const group = all.filter((change) =>
      bump === undefined
        ? rank(change.bump) === BUMP_TYPES.length
        : change.bump === bump,
    );

    if (group.length === 0) continue;

    const items = group.map(
      ({ text, packages: names }) =>
        `${text}\n\n  Packages: ${names.map((name) => `\`${name}\``).join(", ")}`,
    );

    body.push(`## ${bump ?? "Other"} Changes\n\n${items.join("\n\n")}`);
  }

  if (withoutChanges.length > 0) {
    body.push(
      `## Released without changes\n\n${withoutChanges.map((name) => `- \`${name}\``).join("\n")}`,
    );
  }

  if (body.length === 0) {
    body.push(`No changelog entries found for \`${version}\`.`);
  }

  return body.join("\n\n");
};

const readStdin = async () => {
  const chunks = [];

  for await (const chunk of process.stdin) chunks.push(chunk);

  return Buffer.concat(chunks).toString("utf8");
};

const readChangelogFile = (pkg) => {
  try {
    return readFileSync(join(pkg.path, "CHANGELOG.md"), "utf8");
  } catch {
    // A package published for the first time may not have a changelog yet.
    return "";
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];

  if (!version) {
    console.error("usage: release-notes.mjs <version>");
    process.exit(1);
  }

  console.log(
    buildReleaseNotes(
      JSON.parse(await readStdin()),
      version,
      readChangelogFile,
    ),
  );
}
