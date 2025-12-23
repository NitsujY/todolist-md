<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements

- [x] Scaffold the Project

- [x] Customize the Project

- [x] Install Required Extensions

- [x] Compile the Project

- [x] Create and Run Task

- [x] Launch the Project

- [x] Ensure Documentation is Complete

- [x] Always keep the README.md for high level and SPECIFICATION.md for low level up to date with the latest features and changes.

## Branching & Release Workflow

- Default to working on `develop` for normal feature/fix commits.
- Avoid committing/pushing directly to `main` unless explicitly asked to do a release.
- If the user says "commit" or "commit and push" without specifying a branch:
	- Checkout `develop` (or create a feature branch off `develop` if appropriate).
	- Commit there and push there.
	- Ask before pushing if branch intent is ambiguous.
- Release flow:
	- Merge/squash `develop` into `main` for releases.
	- Prefer non-destructive history changes (revert) over force-push unless explicitly approved.
