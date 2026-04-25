# Claude instructions

Read `AGENTS.md` first.

This project is a monorepo:

- Backend: `backend/` — Laravel, PHP, Eloquent ORM
- Frontend: `frontend/` — React, JavaScript, Vite

Follow all rules from `AGENTS.md`.

Important:
- Prefer search/grep before opening files.
- Do not inspect `backend/vendor/`, `frontend/node_modules/`, `backend/storage/`, `.git/`, `.idea/`.
- Do not edit code before producing a plan unless explicitly asked.
- Prefer minimal diffs.
- For frontend bugs, trace:
  `frontend component/hook → Frontend API client → Backend route → Backend controller → Backend request/resource → Backend model/query`.