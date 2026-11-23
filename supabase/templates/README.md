# Commutemap auth email templates

Supabase sends sign-up, password reset, magic-link and email-change emails using templates set in the dashboard. These are the Commutemap-branded versions.

Paste each one into **Supabase dashboard → Authentication → Emails → Templates**, with these subjects:

| Template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your Commutemap account | `confirmation.html` |
| Reset password | Reset your Commutemap password | `recovery.html` |
| Magic link | Your Commutemap sign-in link | `magic_link.html` |
| Change email address | Confirm your new email for Commutemap | `email_change.html` |

`{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .SiteURL }}` are filled in by Supabase. Set **Authentication → URL Configuration → Site URL** to the live Commutemap address so links and the footer point to the right site.

The sender name and address ("Supabase Auth", noreply@mail.app.supabase.io) can only be changed by adding custom SMTP under **Authentication → Emails → SMTP Settings**, for example with Resend or Postmark. Set the sender name to `Commutemap`. Supabase's built-in sender is also rate-limited and meant for testing, so custom SMTP is worth setting up before launch.
