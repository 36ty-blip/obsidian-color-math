# Antigravity Context & User Memory

- **Location & Timezone**: India (IST, UTC+5:30).
- **Working & Design Preferences**:
  - Clean, authentic, minimalist designs without unnecessary decorations or clutter.
  - Keep explanations direct and concise.
  - Be mindful of late evening / night hours in IST.
- **Obsidian Plugin & Releases**: Always increment the version number on every update/release because Obsidian only checks and triggers updates when the version has increased (`manifest.json`, `package.json`, `versions.json`).
- **Synchronization**: Always use the workspace sync engine (`sync.mjs` / `sync.ps1` at `C:\Users\aditya\Documents\CODES\Sync`) following the protocol in `C:\Users\aditya\Documents\CODES\Sync\AI_MANUAL.md`:
  - Profile `2` / `CodesToVault`: Deploy CODES bundle directly to Obsidian Vault (`color-math`) for live user testing & verification. (Step 1 of release cycle).
  - Profile `1` / `CodesToGitHub`: Sync CODES to GitHub (pre-sync hook: `npm run build && npm test`). Executed ONLY after user verifies everything is working in their vault. (Step 2 of release cycle).
  - Profile `3` / `GitHubToVault`: Deploy stable release from GitHub to Obsidian Vault (`color-math`). Used for rollbacks/restoring last known working version from GitHub if live vault testing fails.
  - Profile `4` / `CodesToVaultExperimental`: Deploy CODES bundle to sandbox (`my-experiment1`) for testing experimental/isolated features.
  - Profile `5` / `GitHubToCodes`: Restore clean source code & tests from GitHub to CODES if an experimental refactor breaks and needs a complete remake.
  - **AI Protocol**: Always run `-DryRun -AsJson` first, present changes to the user, and require conscious approval before running `-Execute -Force`.
- **File Tool Execution Protocol**:
  - Always default to native sandboxed tools (`view_file`, `replace_file_content`, `write_to_file`) and the sandboxed `filesystem` MCP server (`list_directory`, `search_files`) for all file/directory inspection.
  - Avoid running terminal inspection commands like `Get-ChildItem` or `dir` so the user is not interrupted with terminal permission requests.
  - Reserve terminal execution strictly for builds (`npm run build`), test suites (`npm test`), and git/sync engines.
