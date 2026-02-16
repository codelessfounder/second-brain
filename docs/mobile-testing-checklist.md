# Mobile optimisation – Phase 6 testing checklist

Use this when verifying the app on real devices or in responsive mode (e.g. Chrome DevTools, ~390×844).

## Flows to test (6.1)

- [ ] **Landing:** Profile button, heading wrap, input (Plus + field; model/Mic hidden &lt;640px).
- [ ] **First message:** Type and send from landing; confirm transition to conversation view.
- [ ] **Chat:** Scroll messages, send another message, tap source pills (if any).
- [ ] **Canvas tab:** Switch to Canvas, confirm content and Copy button work.
- [ ] **Copy:** Tap Copy in canvas header; confirm feedback/clipboard.

## Orientations (6.2)

- [ ] **Portrait:** No horizontal scroll; header and tab bar readable.
- [ ] **Landscape:** Layout still usable; safe areas and tap targets OK.

## Design consistency (6.3)

- [ ] Colours and typography match desktop (brain tokens, SpotifyMix).
- [ ] Only layout and tap target sizes differ; no extra UI or styles.

## Notes

- Breakpoint: mobile layout and many utilities use **768px** (Tailwind `md`). A `mobile` screen token is defined in `tailwind.config.ts` (768px) for future use.
- Safe areas: top (landing bar, conversation header), bottom (chat input). Test on a notched device or simulator.
