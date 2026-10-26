# AGENTS.md

Источник правды для агента по этому репо. Перед прод/SSH/деплоем — читать секцию **Infrastructure**. Менять её только при реальном изменении фактов (не догадки, не DNS-угадывания).

## Infrastructure

Актуально на 2026-10-21.

### Production (новый стек Laravel/Next)

| | |
| --- | --- |
| SSH | `deploy@45.135.234.8` |
| Hostname | `cloudvps.perfumer.by` |
| Ключ | `~/.ssh/id_rsa` (`IdentitiesOnly=yes`) |
| Проект | `/var/www/perfumer-by` |
| Локальные дампы БД | `/var/backups/perfumer` (хранить 3 последние) |
| Скрипт бэкапа | `scripts/backup-db.sh` |

```bash
ssh -i ~/.ssh/id_rsa -o IdentitiesOnly=yes deploy@45.135.234.8
```

### Offsite backup (SFTP)

| | |
| --- | --- |
| SFTP | `backup@31.220.42.4` порт `22` |
| Каталог | `/data` |
| Доступ | только SFTP (shell нет) |
| На remote | один актуальный `db-*.sql.gz` |
| Приватный ключ (локально) | `~/.ssh/perfumer-backup-ed25519` |
| Приватный ключ (на проде) | `/home/deploy/.ssh/perfumer-backup-ed25519` |
| Env на проде | `/home/deploy/backup.env` (cron 03:15 sourcing) |
| Env пример в репо | `scripts/backup.env.example` |

### Не путать

- `perfumer.by` DNS A → `45.135.234.155` — **старый** сайт (LiteSpeed/OpenCart). **Не** SSH-хост нового стека.
- Dev: `root@192.168.0.25`, проект `/var/www/perfumer-by` (`APP_ENV=local`).

### Правила работы с продом

- Хост/юзер/ключ брать **только** из этой секции, не из `dig` / whois / перебора.
- На прод — только `deploy` + `id_rsa`, пока владелец не сказал иначе.
- Не перебирать ключи. Не логиниться под `root`, если не попросили явно.
- После смены IP/ключей/путей — сразу обновить эту секцию.

---

## Project Structure

This is a monorepo.

Root:
- `perfumer-by/`

Backend:
- `backend/`
- Laravel API
- JSON responses
- auth/session may use cookies or Sanctum

Frontend:
- `frontend/`
- Next.js App Router
- React
- TypeScript
- Tailwind CSS

Agents should always consider both `frontend/` and `backend/` when debugging API, auth, checkout, account, admin, product, cart, order, or ecommerce logic.

---

## Project Context

Frontend for ecommerce project.

Includes:
- storefront
- admin panel
- account pages
- checkout flow

Backend:
- Laravel API
- JSON responses
- auth/session may use cookies or Sanctum

Frontend stack:
- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS

Primary goals:
- fast development
- maintainable code
- compact admin UI
- production-ready output


---

## General Coding Rules

- Always use TypeScript
- Prefer explicit types
- Prefer functional React components
- Keep components small and reusable
- Avoid unnecessary abstractions
- Avoid overengineering
- Avoid duplicate code
- Keep code readable
- Keep changes minimal and focused
- Do not rewrite unrelated code


---

## React / Next.js Rules

- Use App Router conventions
- Use `"use client"` only when necessary
- Prefer server components when possible
- Use client components only for:
  - state
  - browser APIs
  - events
  - modals
  - forms

- Avoid unnecessary `useEffect`
- Avoid derived state when not needed
- Prefer memoization only when justified
- Avoid hydration issues
- SSR-safe code only


---

## Styling Rules

- Tailwind CSS only
- Reuse existing utility classes
- Mobile first
- Responsive layouts required
- Keep spacing consistent
- Prefer compact layouts in admin panel
- Prefer clean modern UI
- Avoid oversized paddings/margins
- Avoid decorative clutter


---

## Admin Panel Rules

Priority:
1. information density
2. readability
3. speed of use
4. responsive support

Rules:
- tables may scroll horizontally
- controls should be compact
- modals must fit viewport height
- forms should be efficient
- desktop-first, mobile supported
- actions should be obvious


---

## Modal Rules

- Use portal when existing project pattern uses portal
- Close on overlay click if current UX allows
- Prevent body scroll while opened
- Respect viewport height
- Internal content should scroll, not whole page
- Mobile modal may use bottom-sheet style
- Desktop modal centered


---

## Table Rules

- Responsive
- Horizontal scroll allowed
- Compact row height
- Numeric columns aligned right if useful
- Actions aligned consistently
- Preserve readability on mobile


---

## API / Data Rules

- Backend is source of truth
- Do not change API contracts unless requested
- Preserve existing field names
- Preserve existing types
- Reuse existing fetch helpers/hooks if present

Important:
- money values may come as strings
- do not use float math for prices
- preserve precision
- null values are valid unless known otherwise


---

## Ecommerce Rules

Products:
- variants are purchasable entities
- product may have multiple variants
- stock may be null
- preorder may exist

Orders:
- totals come from backend
- discounts may exist
- gift certificates may exist
- delivery fee separate unless backend combines it

Always preserve business logic.


---

## File Organization Rules

Prefer existing structure.

Do not move files unless requested.

If creating new files:
- place near related feature
- use clear naming
- avoid unnecessary nesting


---

## Refactoring Policy

If user asks for a fix:
- solve only requested issue

If user asks for improvement:
- improve targeted area only

Do NOT:
- rewrite architecture
- rename many files
- introduce patterns without need


---

## Output Expectations

Always prefer:

- production-ready code
- directly usable code
- minimal explanation
- preserve current style of project
- clean formatting

Avoid:

- placeholders
- pseudo-code
- excessive comments
- speculative refactors


---

## When Context Is Missing

Infer from existing codebase patterns first.

Prefer consistency with current project over generic best practices.


---

## Personal Preference of Project Owner

- concise code
- practical solutions
- fast UI
- compact admin layouts
- minimal unnecessary complexity