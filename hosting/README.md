# Private acceptance host

This optional Vinext Worker serves the fictional acceptance workspace. The standalone deployment target for TCG Engineering is documented in the root README. The host binds DB to D1 and saves a separate fictional workspace for each authenticated private-site viewer.

Run node scripts/prepare-host.mjs at the repository root before rebuilding this host. The command copies the browser assets and stages the generated D1 migration. Build using this project's pinned dependencies and npm run build. Host deployment must apply drizzle migrations and retain the private access policy. HTTP handlers use the same workflow engine as the standalone installation.
