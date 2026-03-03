# Branch Protection Checklist

Use this checklist for the `main` branch.

## Required Status Checks

- `quality`
- `test-build`

## Pull Request Rules

- Require pull request before merging.
- Require at least 1 approval.
- Dismiss stale approvals when new commits are pushed.
- Require approval of the most recent push.
- Require conversation resolution before merge.

## History Safety

- Require branches to be up to date before merge (`strict` checks).
- Disallow force pushes.
- Disallow branch deletion.
- Enforce rules for admins.

## Automation

- Workflow: `.github/workflows/branch-protection.yml`
- Secret required: `REPO_ADMIN_TOKEN` (fine-grained PAT with repository administration write permission).
- Trigger: run workflow manually (`workflow_dispatch`) after setting the secret.
