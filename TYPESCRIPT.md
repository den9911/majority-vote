# TypeScript migration

The checked source currently covers preferences, browser language/theme resolution, shared contracts, and server input/image validation. Existing UI and HTTP routing remain JavaScript. This staged boundary keeps the existing behavior testable while replacing modules with typed source.

Use `npm ci`, `npm run typecheck`, `npm run build`, and `npm run check:generated`. Compiler errors stop the build. Generated files are committed to keep deployment independent of build tools. Do not hand-edit generated preference or validation modules.

Next boundaries: shared DOM helpers and API client, individual application state, then HTTP routing and SQLite row types. Each move should retain the existing integration tests and real browser workflows. Avoid blanket `any`, `@ts-nocheck`, and renaming files without types.
