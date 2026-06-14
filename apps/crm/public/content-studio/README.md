# Content Studio image library

Drop the on-brand creative PNGs here. Until they exist, the UI shows a tasteful purple "On-brand
creative — image pending" placeholder (handled via `onError`), so the feature works and demos before
the images are supplied. Filenames + tags must match `apps/crm/src/lib/content-studio/library.ts`.

| File | Theme | Persona | Channels | Suggested copy |
|---|---|---|---|---|
| `winback-vip-01.png` | winback | DORMANT | WhatsApp, RCS | We've missed you — here's 20% off your next StyleArc order. |
| `highspender-01.png` | loyalty | HIGH_SPENDER | RCS, WhatsApp | An exclusive early-access drop, just for you. |
| `new-2nd-purchase-01.png` | new | NEW | WhatsApp, Email | Loved your first StyleArc piece? Complete the look. |
| `festive-01.png` | festive | (any) | WhatsApp, RCS, Email | Festive edit is here — dress for the season. |
| `discount-01.png` | discount | DISCOUNT_HUNTER | SMS, WhatsApp | Flash sale: your favourites, now 20% off. |
| `dormant-rcs-01.png` | winback | DORMANT | RCS | Come back to StyleArc — a little something to welcome you. |

Suggested size: square or 4:3, ~1024px, on-brand StyleArc fashion creative. PNG (or update the
extensions in `library.ts` if you use JPG/WebP).
