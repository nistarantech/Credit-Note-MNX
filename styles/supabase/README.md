# Supabase design tokens

These stylesheets are vendored from the Supabase monorepo
(<https://github.com/supabase/supabase>, `packages/ui/build/css` and
`packages/config/css`). The repository is Apache-2.0 and the `ui`,
`ui-patterns` and `config` packages each declare MIT in their package.json.
The React components that consume them live in `src/components/ui` and
`src/components/ui-patterns`.

Local changes, kept deliberately small so a future sync stays a diff:

- `theme.css` drops the Radix hue scales (`amber-100` … `yellow-1200`) and the
  shadcn sidebar tokens. The ERP pages use Tailwind's own palette
  (`text-zinc-500`, `text-red-600`), and Supabase's scales reuse those names
  with different steps, so keeping them would silently recolour those pages.
  `--font-sans` / `--font-mono` point at Inter / Source Code Pro instead of
  Supabase's licensed Circular.
- `colors.css` keeps only the `scale` and `brand` ramps, for the same reason,
  and also answers to the `.dark` class next-themes sets.
- `variants.css` makes `dark:` follow that `.dark` class as well as
  `[data-theme*='dark']`.
- `typography.css` keeps the `heading-*` / `text-*` utilities but not the base
  layer that resizes `h1`–`h6`, which the certificate and ID-card print views
  depend on.
