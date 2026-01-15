## Security / Open-sourcing

This repository is intended to be safe to open-source: it does not require any API keys, tokens, or passwords in code.

- **IBKR credentials**: This app connects to **your local** TWS / IB Gateway via the official API. Your credentials stay inside TWS/Gateway and are not stored by this project.
- **Do not commit local artifacts**: Ensure `.env`, `.venv/`, `node_modules/`, `frontend/dist/`, `.claude/`, and `*.log` are not committed (see `.gitignore`).
- **Before publishing**: Run `git status -u` and confirm you are not about to commit any local configs, logs, database files, or keys/certificates.

