# Security Policy

## Supported versions

The site runs as a continuous deployment from `main`. There are no versioned releases, so only the latest `main` (and the live deploy built from it) receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a security problem.

Email **[infoLeonid@protonmail.com](mailto:infoLeonid@protonmail.com)** with a description of the issue, the steps to reproduce it, and any affected URLs or endpoints. If the report is actionable, you will get an acknowledgement within 7 days and a follow-up when a fix ships. If you hear nothing within 14 days, follow up on the same thread.

## Scope

In scope:

- The web app served from `pocketdecks.top` and its Firebase hosting preview channels
- The analysis pipeline that processes Limitless tournament data
- Anything in this repository that handles credentials, tokens, or user-supplied input

Out of scope:

- Rate limiting or denial of service
- Social engineering of third-party services
- Issues in the Limitless or pokemon-tcg-pocket-cards data sources themselves; report those upstream

## Disclosure

Please give a reasonable window to fix before any public disclosure. Coordination rather than a drop-date is appreciated; you will be credited in the fix notes if you want to be.
