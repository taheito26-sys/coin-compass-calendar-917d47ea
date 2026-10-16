# Project workflow rules

## Always ship fixes to `main` immediately

Whenever a fix is made in this repo, it must be **pushed and merged into
`main`**, not left sitting in an open/draft PR. The user tests the live
deployed app, not preview URLs — a fix that isn't on `main` does not exist
from their point of view, and they will (correctly) report "the same bug"
even though a fix was written.

Concretely, for every fix in this repo:
1. Run `npx tsc --noEmit -p .` and `npx vitest run` — both must pass.
2. Commit with a descriptive message.
3. Push the branch and open a PR against `main`.
4. **Immediately mark it ready for review (not draft) and merge it** (squash)
   once CI is green and there's no merge conflict. Do not leave it as an
   open/draft PR waiting on nothing.

Standing up a draft PR and stopping there is not a completed fix.
