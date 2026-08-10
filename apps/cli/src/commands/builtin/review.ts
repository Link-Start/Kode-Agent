import type { Command } from '../types'

export default {
  type: 'prompt',
  name: 'review',
  description: 'Review local changes, a path, commit, or pull request',
  isEnabled: true,
  isHidden: false,
  progressMessage: 'reviewing code',
  userFacingName() {
    return 'review'
  },
  async getPromptForCommand(args) {
    const scope = args.trim()
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are performing a read-only, evidence-backed code review.

<review_scope>${scope || 'working-tree'}</review_scope>

Determine the scope without guessing:
- Empty scope or "working-tree": review all tracked and untracked local changes. Inspect git status, staged and unstaged diffs, and relevant untracked files.
- A PR number or pull-request URL: inspect PR metadata and the full diff with gh.
- A commit or range: inspect that exact git diff.
- Any other value: treat it as a user-supplied path or review focus. Quote shell arguments safely; never interpolate the scope into a shell command as executable syntax.

Before judging the diff, read applicable AGENTS.md/project instructions and enough surrounding production code, tests, schemas, and callers to understand intended behavior. Do not modify files, post comments, approve a PR, or perform any external write unless the user separately asks.

Review for real defects across these dimensions:
- correctness and boundary/error behavior
- business logic and compatibility with callers/contracts
- security, permissions, secrets, and unsafe input handling
- concurrency, state consistency, and data loss
- performance and resource bounds
- tests, observability, accessibility, and maintainability where relevant

Report findings first, ordered by severity (P0-P3). Each finding must include confidence, a precise file:line location, the concrete failure scenario and impact, and a focused remediation. Avoid style-only comments unless they violate an explicit project rule. If evidence is incomplete, inspect further or label the uncertainty instead of asserting a defect.

After findings, include a short scope summary and residual test/verification gaps. If no actionable defect is found, say so explicitly and still state what was reviewed and what remains unverified.`,
          },
        ],
      },
    ]
  },
} satisfies Command
