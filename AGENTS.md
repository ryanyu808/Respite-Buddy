# NeuroRoute Collaboration Guidelines

These instructions apply to all future Codex sessions in this repository.

## Before every coding session

- Inspect Git status and the current branch.
- Fetch the latest remote changes.
- Check whether teammates have updated `main`.
- Safely integrate new changes into the current feature branch when appropriate.
- Never discard uncommitted work.
- Never overwrite another teammate's changes.

## During development

- Preserve existing working functionality.
- Avoid unnecessary modifications to unrelated files.
- Follow the existing project architecture.
- Write modular, maintainable code.
- Coordinate changes to shared interfaces and APIs.
- Never replace newer code with an older implementation.
- Do not make destructive Git operations.

## Before committing

- Review all changes.
- Run relevant tests.
- Check for regressions.
- Verify no secrets or API keys are included.
- Stage only relevant files.
- Write descriptive commit messages.

## Before pushing

- Fetch the latest remote updates.
- Check for integration conflicts.
- Push only to the current feature branch.
- Never force-push.
- Never push directly to `main`.

## Pull requests

- Prepare pull requests targeting `main`.
- Summarize implemented features and test results.
- Never automatically merge pull requests.
- Leave final merging to a human reviewer.

## End of each session

- Report files changed.
- Report tests performed.
- Report the current branch.
- Report the commit hash.
- Confirm whether changes were pushed.
- Report any unresolved issues.
