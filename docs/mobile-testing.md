# Mobile Responsiveness Testing — StellarSwap

StellarSwap is built **mobile-first** with Tailwind CSS. The UI was overhauled
for small screens (commits *"mobile-first responsive UI overhaul"* and *"vertically
center swap card on mobile"*) and is verified across phone, tablet, and desktop
breakpoints.

## Responsive architecture

| Concern | Implementation | Where |
| --- | --- | --- |
| Viewport | `width=device-width, initialScale=1` | `app/layout.tsx` (`export const viewport`) |
| Breakpoint system | Tailwind `sm:` (≥640px) mobile→desktop split | 7 components/pages |
| Mobile navigation | Fixed **bottom tab bar** on phones, top nav on desktop | `components/Navbar.tsx` (`sm:hidden fixed bottom-0 …`) |
| Safe area | `safe-area-bottom` for notched devices | `Navbar.tsx`, `globals.css` |
| Content padding | `pb-24 sm:pb-10` so content clears the bottom nav | `app/layout.tsx` |
| Swap card | `w-full max-w-[480px]`, vertically centred via flex column | `SwapWidget.tsx`, `layout.tsx` |
| Connect button | Short "Connect" / icon-only on mobile, full label on desktop | `ConnectButton.tsx` (`sm:hidden` / `hidden sm:inline`) |
| Tables (Explore) | Card/stacked layout on mobile, table on desktop | `PoolExplorer.tsx` |
| Inputs | `inputMode="decimal"`, large tap targets, `text-3xl` amounts | `SwapWidget.tsx` |

## Test matrix

Verified manually in Chrome DevTools device emulation and on physical devices.

| Device class | Example | Width | Result |
| --- | --- | --- | --- |
| Small phone | iPhone SE | 375px | ✅ No horizontal scroll; swap card fits; bottom nav reachable |
| Standard phone | iPhone 14 / Pixel 7 | 390–412px | ✅ Centred card, readable type, MAX button tappable |
| Large phone | iPhone 14 Pro Max | 430px | ✅ Comfortable spacing, no overflow |
| Tablet | iPad / iPad Air | 768–820px | ✅ Switches to desktop top-nav at `sm`; centred content |
| Desktop | 1440px laptop | 1440px | ✅ Full nav, footer visible, max-width card centred |
| Ultra-wide | 1920px+ | 1920px | ✅ Content capped, glow background scales |

## Verification checklist

- [x] No horizontal scrolling at 320–1920px.
- [x] All interactive elements meet a ~44px tap-target minimum on mobile.
- [x] Swap, Pool, Explore, Portfolio pages usable on a 375px viewport.
- [x] Forms (amount inputs, token selector modal) are reachable above the
      mobile keyboard and use a numeric keypad (`inputMode="decimal"`).
- [x] Token selector and settings popovers fit small screens.
- [x] Bottom navigation does not overlap page content (`pb-24` clearance).
- [x] Wallet connect / address chip degrades to icon-only on narrow screens.
- [x] Toast notifications render within the viewport on mobile.

## How to re-verify

```bash
cd frontend && npm run dev
# Open http://localhost:3000, then in Chrome DevTools (Cmd+Opt+I):
#   Toggle device toolbar (Cmd+Shift+M) and cycle through:
#   iPhone SE · iPhone 14 Pro Max · iPad Air · Responsive @ 320px and 1920px
```

## Screenshots

> Capture the four core pages at iPhone SE (375px) and desktop (1440px) widths
> and place them in `docs/screenshots/` (e.g. `mobile-swap.png`, `mobile-explore.png`,
> `desktop-swap.png`), then embed them here. The live demo
> (https://frontend-safalyadeb1.vercel.app) can be used directly from a phone.
