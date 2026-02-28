# Git Hooks

Enable project hooks with:

```bash
git config core.hooksPath .githooks
```

Current hook:
- `pre-commit`: runs lint (if defined) and tests.
