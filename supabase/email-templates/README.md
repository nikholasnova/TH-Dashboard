# Supabase Auth Email Templates

Source-of-truth HTML for each Supabase Auth email. Paste into Supabase Dashboard -> Authentication -> Email Templates.

All templates share: warm-grey palette matching the dashboard, Georgia serif stack, `@media (prefers-color-scheme: dark)` + `!important` overrides to block Gmail's dark-mode auto-inversion, mobile media queries for narrow viewports.

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
