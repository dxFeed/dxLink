// Builds the GitHub Release body: for each published package, the `## <version>` section of its
// CHANGELOG.md. Packages the fixed group bumped without changes share one trailing list rather
// than getting an empty heading each.
//
// Usage: pnpm ls -r --depth -1 --json | node release-notes.mjs 1.2.3

import { readFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2];

if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(1);
}

/** Extract the body of the `## <version>` section from a changelog. */
const sectionFor = (changelog, wanted) => {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${wanted}`);

  if (start === -1) return "";

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));

  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
};

const readStdin = async () => {
  const chunks = [];

  for await (const chunk of process.stdin) chunks.push(chunk);

  return Buffer.concat(chunks).toString("utf8");
};

const packages = JSON.parse(await readStdin())
  .filter((pkg) => !pkg.private)
  .sort((a, b) => a.name.localeCompare(b.name));

const sections = [];
const withoutNotes = [];

for (const pkg of packages) {
  let changelog = "";

  try {
    changelog = readFileSync(join(pkg.path, "CHANGELOG.md"), "utf8");
  } catch {
    // A package published for the first time may not have a changelog yet.
  }

  const notes = sectionFor(changelog, version);

  if (notes) {
    // Demote the changelog's own `###` headings so they nest under the package name.
    sections.push(`## ${pkg.name}\n\n${notes.replace(/^### /gm, "#### ")}`);
  } else {
    withoutNotes.push(pkg.name);
  }
}

const body = [...sections];

if (withoutNotes.length > 0) {
  body.push(
    `## Released without changes\n\n${withoutNotes.map((name) => `- \`${name}\``).join("\n")}`,
  );
}

if (body.length === 0) {
  body.push(`No changelog entries found for \`${version}\`.`);
}

console.log(body.join("\n\n"));
