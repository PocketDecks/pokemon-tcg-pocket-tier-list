# How-to guide: Refreshing the pinned robots list

`public/robots.txt` is generated from a pinned copy of the ai.robots.txt list. The build never fetches the network, so a refresh is a reviewed diff in this repository.

## Steps

1. Download the upstream list from its `main` branch:

   ```
   curl -sSfL https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json -o scripts/data/robots-upstream.json
   ```

2. Record the upstream commit it came from. Get the SHA with `gh api repos/ai-robots-txt/ai.robots.txt/commits/main -q .sha`, then set `sha` and `fetched` in `scripts/data/robots-upstream.source.json`.

3. Regenerate the file from the repository root:

   ```
   node scripts/generate-robots.mjs
   ```

4. Review the diff of `public/robots.txt`. New upstream agents should appear in the block group. No agent from the allow group or the never-listed group should appear in it.

5. Update the hard-coded lists in `scripts/__tests__/crawler-policy.test.js` if the policy changed, then run `yarn check:generated` and `yarn test:ci`.

`yarn check:generated` runs `generate-robots.mjs --check`, which fails when `public/robots.txt` differs from the generator's output. Do not edit `public/robots.txt` by hand.

## Policy lists

`scripts/robots-policy.mjs` holds two lists:

- `ALLOW_GROUP` is the agents that get an explicit `Allow: /`. These are search and user-triggered agents that fetch pages to answer a request.
- `NEVER_LISTED` is the agents that are left out of the file entirely, so the wildcard `Allow: /` applies. Add an agent here when blocking it would break a feature the site relies on, such as link previews, and its upstream entry does not cover a training use.

Every other upstream agent is blocked by default. Each name in either list must exist in the pinned upstream list, and the generator tests check that.
