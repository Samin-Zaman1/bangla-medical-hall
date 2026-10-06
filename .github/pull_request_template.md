## What & why

<!-- What does this change, and what problem does it solve? Link the issue: Closes #123 -->

## How it was tested

- [ ] `npm test` (unit, component, DB)
- [ ] `npm run test:e2e` (Playwright, local Supabase)
- [ ] Tried it by hand: <!-- which screens / flows -->

## Checklist

- [ ] New behaviour has tests at the right level (SQL logic → `tests/db`, API rules → `tests/unit/api`, user journeys → `tests/e2e`)
- [ ] **Migrations:** new file in `supabase/migrations/` (never edit an applied one), backwards-compatible with the currently deployed app, and `prisma/schema.prisma` updated to match
- [ ] New tables have RLS enabled (`tests/db/schema.test.ts` checks this)
- [ ] No secrets, `.env*` files or personal documents committed
- [ ] Screenshots attached for UI changes
