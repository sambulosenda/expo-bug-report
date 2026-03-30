# Design System — BugPulse

## Product Context
- **What this is:** Lightweight in-app bug reporting SDK for React Native/Expo, with a web dashboard for viewing and managing reports
- **Who it's for:** Mobile developers (SDK integration) and their non-dev teammates (dashboard for reviewing bugs)
- **Space/industry:** Developer tools, mobile observability. Peers: Instabug/Luciq, Sentry, Shake, BugSnag
- **Project type:** Web dashboard (Astro) + mobile SDK UI (React Native bottom sheet, annotation canvas)

## Aesthetic Direction
- **Direction:** Warm Industrial
- **Decoration level:** Intentional — texture comes from data itself (sparklines, screenshot thumbnails, log snippets). Subtle 2% noise grain on root backgrounds. No decorative blobs or illustrations.
- **Mood:** Precision tool built by someone who filed 1000 bug reports and finally made the tool they wanted. Well-lit workshop energy, not cold SaaS or enterprise lobby.
- **Reference sites:** Linear (layout discipline), Sentry (personality in interactions), Vercel (developer credibility)

## Typography
- **Display/Hero:** Space Grotesk — geometric but warm, distinctive squared terminals build brand recognition at large sizes. Not cold like Inter, not generic like system sans.
- **Body:** General Sans (Fontshare, free) — humanist enough that PMs reading bug reports at 14px don't feel like they're in a terminal. Wider x-height keeps dense tables legible.
- **UI/Labels:** Space Grotesk at smaller weights — maintains brand voice in navigation and labels
- **Data/Tables:** JetBrains Mono (tabular-nums) — the only monospace font developers think looks good. Ligatures for code blocks.
- **Code:** JetBrains Mono
- **Loading:** Google Fonts for Space Grotesk + JetBrains Mono. Fontshare CDN for General Sans. Subset to latin for performance.
- **Scale:**
  - 3xl: 72px / 4.5rem (hero stats, open bug count)
  - 2xl: 48px / 3rem (page titles)
  - xl: 32px / 2rem (section headings)
  - lg: 24px / 1.5rem (card titles)
  - md: 16px / 1rem (body text)
  - sm: 14px / 0.875rem (secondary text, metadata)
  - xs: 12px / 0.75rem (timestamps, badges)
  - 2xs: 10px / 0.625rem (letter-spaced caps labels)
- **No serif anywhere.** This is a tool.

## Color

- **Approach:** Restrained + warm. One accent, warm neutrals. Color is rare and meaningful.

### Dark Mode (primary)
- **Root:** `#1A1814` — warm near-black, not blue-black like Linear/Vercel
- **Surface:** `#242019` — raised cards, panels
- **Surface hover:** `#2E2A22` — interactive hover states
- **Inset:** `#141210` — recessed areas, code blocks, nav rail
- **Text primary:** `#E8E0D4` — warm white, never pure `#FFFFFF`
- **Text secondary:** `#9B9183` — muted, readable at 13px
- **Text ghost:** `#5C554B` — timestamps, metadata

### Light Mode (secondary citizen)
- **Root:** `#F5F0EA` — parchment, not clinical white
- **Surface:** `#FFFFFF`
- **Surface hover:** `#F0EBE4`
- **Text primary:** `#1A1814`
- **Text secondary:** `#6B6358`
- **Text ghost:** `#9B9183`

### Accent — Signal Orange
- **Primary:** `#E86B2E` — the core brand mark. Every competitor is purple or blue. Orange is an alert color, perfect for a bug tool. Feels like copper/signal lamp, not warning banner.
- **Hover:** `#F07A3E`
- **Muted:** `#E86B2E26` (15% opacity, for backgrounds and highlights)

### Semantic
- **Critical:** `#D94B4B` — warm red, enough distance from accent orange
- **Open/Warning:** `#E8A02E` — amber
- **Resolved/Success:** `#5BA865` — muted green
- **Info:** `#5B8FA8` — steel blue
- **Ignored:** `#5C554B` — ghost text color

### Borders
- **Subtle:** `#2E2A2233` — barely visible separation
- **Visible:** `#3D372F` — card borders, dividers

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Asymmetric, composition-first
- **Grid:** Dashboard uses asymmetric splits (60/40, 70/30) not equal columns. Detail views weight left, overview views weight right.
- **Navigation:** 48px icon rail on far left, expands to 200px with labels on hover. Uses inset background, feels carved into the page.
- **Max content width:** 1400px
- **Border radius:** Hierarchical, sharp. sm: 2px, md: 4px (max for most elements), lg: 8px (modals only), full: 9999px (avatars, badges only)
- **SDK modal:** Bottom sheet rising to 85% screen height. Pull down to annotate, push up for form. Single gesture, two modes.

## Motion
- **Approach:** Intentional — every animation aids comprehension, nothing decorative
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(75ms) short(150ms) medium(300ms) long(500ms)
- **Specific behaviors:**
  - Buttons lift 1px on hover with subtle shadow increase
  - Inputs sink 1px on focus, reinforcing interaction depth
  - Bug feed items slide in from left with 150ms stagger
  - Page transitions: 300ms crossfade
  - No bouncy/spring animations. Precision tool.

## Anti-Patterns (never use)
- Purple/violet gradients
- 3-column icon grids with colored circles
- Centered-everything layouts
- Uniform bubbly border-radius (16px+ on cards)
- Gradient buttons as primary CTA
- Generic stock-photo hero sections
- Decorative blobs, circles, or abstract shapes
- Pure black (`#000000`) or pure white (`#FFFFFF`) anywhere

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-30 | Initial design system created | Created by /design-consultation. Researched Sentry, Linear, Instabug. Independent Claude subagent proposed "warm workshop" direction. Variant C (most minimalist/tool-like) approved from 3 AI-generated mockups. |
| 2026-03-30 | Signal orange accent (#E86B2E) | Deliberate departure from category norms (purple/blue). Orange = alert color, fitting for bug tool. Warm copper feel, not warning banner. |
| 2026-03-30 | Warm palette over cool | Warm near-black (#1A1814) instead of cool blue-black. More human, differentiates from Linear/Sentry/Vercel. |
| 2026-03-30 | Sharp corners (4px max) | Precision tool aesthetic. Rounded-everything is AI slop territory. |
| 2026-03-30 | Asymmetric poster layouts | Dashboard first viewport is a composition (bug feed + hero stat), not a grid of equal stat cards. More memorable, harder to confuse with competitors. |
