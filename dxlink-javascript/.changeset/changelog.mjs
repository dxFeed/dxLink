// Changelog generator for `changeset version`, configured in config.json.
//
// Release lines come from @changesets/changelog-github: each entry links its pull request and
// commit and credits its author. It looks them up through the GitHub API, so `changeset version`
// needs a GITHUB_TOKEN in the environment (the release workflow passes its own).
//
// Dependency lines are shortened. All packages share one version (a single `fixed` group), so
// each release bumps every internal dependency, and the default line repeats the commit links of
// every changeset behind those bumps, which are already in the dependency's own changelog.
// List only the bumped versions instead.

import github from '@changesets/changelog-github'

/** @type {import('@changesets/types').ChangelogFunctions['getReleaseLine']} */
export const getReleaseLine = github.getReleaseLine

/** @type {import('@changesets/types').ChangelogFunctions['getDependencyReleaseLine']} */
export const getDependencyReleaseLine = async (_changesets, dependenciesUpdated) =>
  dependenciesUpdated.length === 0
    ? ''
    : [
        '- Updated dependencies:',
        ...dependenciesUpdated.map(({ name, newVersion }) => `  - ${name}@${newVersion}`),
      ].join('\n')
