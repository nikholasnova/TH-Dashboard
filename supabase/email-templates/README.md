# Supabase Auth Email Templates

Source-of-truth HTML for each Supabase Auth email. Paste into Supabase Dashboard -> Authentication -> Email Templates.

All templates share: Georgia serif stack, editorial palette, mobile media queries that make the card go edge-to-edge on phones.

## Color strategy

Per Litmus / Email on Acid research, Gmail (iOS, Android, and web) does *not* honor `@media (prefers-color-scheme: dark)` or the `color-scheme` CSS property — Gmail applies its own partial/full color inversion depending on platform. Trying to force a dark design stay dark leads to fragile hacks.

These templates take a pragmatic two-mode approach:

- **Light-first default:** cream background (`#F5F4F0`), near-white card (`#FDFCF8`), dark editorial text (`#1D1C1B`), muted secondary (`#6B6966`). Matches the dashboard's editorial serif feel inverted.
- **Dark override via `@media (prefers-color-scheme: dark)`:** Apple Mail / iOS Mail / some Gmail web variants honor the media query and swap to the dashboard dark palette (`#1D1C1B` bg, `#2F2F2D` card, `#F5F4F0` text, `#A3A29E` muted).
- **Gmail inversion aligns with user intent:** Gmail iOS + Android inbox in dark mode inverts our light template to dark, producing a result that feels natural to the user's dark-mode experience. In Gmail light mode, the light template renders as-is.

The keepalive alert email (in `web/src/app/api/keepalive/route.ts`) stays dark-only because it's admin-facing and brand-consistent with the dashboard.

| File | Supabase template | Suggested subject |
|---|---|---|
| `invite.html` | Invite user | `You've been invited to the IoT Temp/Humidity Dashboard` |
| `confirm-signup.html` | Confirm signup | `Confirm your email for the IoT Dashboard` |
| `magic-link.html` | Magic Link | `Your sign-in link for the IoT Dashboard` |
| `reset-password.html` | Reset Password | `Reset your IoT Dashboard password` |
| `change-email.html` | Change Email Address | `Confirm your new email for the IoT Dashboard` |
| `reauthentication.html` | Reauthentication | `Security check for your IoT Dashboard account` |

## Deliverability

Supabase Auth sends these via its own mail relay unless you configure custom SMTP. On the free tier that means:

- 2 emails per hour (a hard cap)
- Sender is `noreply@mail.app.supabase.io` -- poor deliverability, frequent spam filtering

**Recommended:** configure Supabase -> Authentication -> SMTP Settings with Resend (see `docs/SETUP.md` section 10.4). That uses the verified `novachuk.dev` domain and lifts the rate limit.

## Previewing locally

Open any file directly in a browser:

```bash
open supabase/email-templates/invite.html
```

The `{{ .ConfirmationURL }}` / `{{ .Email }}` / `{{ .Token }}` tokens render as literal text -- the layout, colors, and responsive behavior are all visible. Supabase substitutes the tokens at send time.

## Updating a template

1. Edit the HTML in this folder.
2. Copy the file contents.
3. Paste into the matching Supabase Dashboard template and save.
4. Commit the file change so the repo stays the source of truth.
