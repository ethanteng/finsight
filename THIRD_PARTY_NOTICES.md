# Third-party notices — Ask Linc

Ask Linc's original code is proprietary (see LICENSE). Third-party software,
generated runtime code, fonts and datasets retain their original rights and
licenses. The repository's proprietary notice does not override those terms.

## npm dependencies

THIRD_PARTY_INVENTORY.json records **1,846** entries from the backend and frontend
lockfiles, including development dependencies and optional platform binaries.
THIRD_PARTY_LICENSES.txt reproduces exact-version upstream license/notice files
collected from matching installed packages or integrity-verified npm tarballs.
MIT/ISC/BSD copyright notices and license texts must accompany distributed code;
Apache-2.0 license text and applicable upstream NOTICE attributions must be retained.
Include the relevant notices with browser bundles and any redistributed server,
container or source packages. Hosting a backend does not by itself distribute all
server dependencies to browser users; examine the actual shipped artifacts.

## Components requiring review

- **sharp / @img/sharp-libvips**: optional native binaries carry **LGPL-3.0-or-later**
  (some sharp platform packages combine Apache-2.0 and LGPL). They are runtime
  dependencies through Next.js. If distributing them in containers or installers,
  review corresponding-source, replacement/relinking and license requirements.
  This does not establish that Ask Linc's own code must be relicensed.
- **@sentry/cli 2.58.6** and its platform packages: **FSL-1.1-MIT**, a restricted
  source-available license, not ordinary MIT at present. Preserve its copyright
  and terms, and review the permitted-purpose/competing-use restriction. This is
  distinct from the MIT-licensed JavaScript Sentry SDK packages.
- **axe-core 4.11.1**: MPL-2.0 development/test dependency; review if distributing it
  or modified covered files. **caniuse-lite**: CC-BY-4.0 data, present in backend
  development and frontend non-dev dependency graphs; preserve applicable credit
  when distributing the data. Its presence in a graph does not prove it is shipped
  to browsers.
- **exit 0.1.2**: lockfile lacks a license field; the installed package's legacy
  `licenses` array identifies MIT and LICENSE-MIT supplies the upstream text.

## Generated and modified third-party code

The tracked generated/prisma directory includes Prisma 6.12.0 runtime code and
native query engines. These are third-party artifacts, not relicensed proprietary
code. generated/prisma/LICENSE retains the upstream @prisma/client Apache-2.0
license; preserve existing inline notices and review native-engine/bundled library
notices when distributing those artifacts. Do not set proprietary package metadata
on this generated package. patches/test-exclude+6.0.0.dev.patch changes a third-party
development package; retain its ISC license and identify the local patch.

## Font and data attribution

The frontend uses **Inter**, Copyright 2016 The Inter Project Authors
(https://github.com/rsms/inter), **SIL Open Font License 1.1**. The upstream font
license is reproduced in THIRD_PARTY_LICENSES.txt. Preserve it with redistributed
font files and check the exact font revision resolved by next/font before release.

The checked-in src/datasets/source-manifest.json identifies data from **Robert J.
Shiller**, **Kenneth R. French Data Library**, and **FRED / Federal Reserve Bank of
St. Louis**. Preserve provider credits and existing copyright headers, including
Copyright 2026 Kenneth R. French. Download availability is not proof of a commercial
redistribution license. Review each source's commercial use, attribution and
redistribution terms, including underlying data-provider rights, before publishing
raw or derived data. No license in this repository grants rights to those datasets.

Sources: https://shillerdata.com/ ;
https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html ;
https://fred.stlouisfed.org/legal/

## Audit limits and maintenance

No GPL/AGPL-only license was identified in the npm lockfile fields. LGPL and MPL
are present as described above. Package metadata does not establish the licenses
of every native or embedded dependency. Some packages have no separate license
file; use the inventory to review README/license headers and upstream terms.
Refresh the inventory and notice texts whenever dependencies change. This baseline
does not certify every production artifact or grant additional data/service rights.
