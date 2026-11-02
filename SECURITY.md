# Security

Schémo is a small vibe-coded project: it was written by an AI (Claude Code), directed by someone with no programming experience. There is no security team, no bounty and no guaranteed response time. See the [license](LICENSE): the software comes with no warranty.

## Supported versions

Only the [latest release](https://github.com/LeEvSa/Schemo/releases/latest) gets fixes.

## Reporting a vulnerability

Please don't open a public issue with the details.

Use **Security → Report a vulnerability** on this repository, so the report stays private. If that option isn't available, open an issue that only asks for a private way to reach the maintainer, without describing the problem.

Please include the Schémo version, what can happen, and the steps to reproduce it.

## What to expect

- The executables are **not code-signed**, so Windows may warn you when you run them. Download them only from this repository's Releases.
- The installed version checks this repository's Releases for updates when it starts, and installs nothing without your approval. It makes no other network connections.
- Diagrams (`.schemo` files) are read as data: text in a diagram can't run code, and links in descriptions don't open.
