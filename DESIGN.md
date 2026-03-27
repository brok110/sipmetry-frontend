# Design System — Sipmetry

## Product Context
- **What this is:** Cocktail decision engine that scans your bar, recommends recipes, and tells you what to buy next
- **Who it's for:** Home bartenders who want to make better drinks with what they have
- **Space/industry:** Cocktail/bartending apps (peers: Cocktail Party, Mixel, Highball)
- **Project type:** Mobile app (Expo/React Native, iOS + Android)
- **Hero feature:** Smart Restock — the bridge from "what can I make?" to "what should I buy?"

## Aesthetic Direction
- **Direction:** Industrial Warmth
- **Decoration level:** Intentional — shadows for depth hierarchy, colored left borders for recipe status, no decorative blobs or gratuitous chrome
- **Mood:** A well-curated cocktail bar at dusk. Warm, sophisticated, confident. Oakland's industrial heritage meets California sunset. Not a tech app, not a SaaS dashboard. The UI should feel like it was built by someone who actually makes drinks.
- **Dark mode only:** Intentional constraint. Matches the environment (making drinks, often at night). Stronger brand identity over universal accessibility.

## Typography

### Current (System Fonts)
Weight hierarchy does the heavy lifting: 700 for body, 800 for emphasis, 900 for headings. San Francisco on iOS, Roboto on Android.

### Planned Upgrade
- **Display/Hero:** Bebas Neue — condensed, bold, bartender energy. Use for screen titles, section headers, large numbers.
- **Body:** Cormorant Garamond — elegant serif for recipe descriptions, ingredient details, longer text. A deliberate risk: serif body text in a mobile app is unusual, but it matches the cocktail culture aesthetic.
- **UI/Labels:** System font (San Francisco/Roboto) — for buttons, pills, tab labels, navigation. Clarity over personality.
- **Data/Tables:** System font with tabular-nums — for ingredient amounts, percentages, counts.
- **Loading:** Google Fonts CDN (Bebas Neue + Cormorant Garamond)

### Type Scale
| Role | Size | Weight | Font |
|------|------|--------|------|
| Hero title | 32px | 900 | Bebas Neue |
| Screen title | 22-28px | 900 | Bebas Neue |
| Section heading | 17-20px | 900 | System |
| Body emphasis | 16px | 800 | System |
| Body | 13-14px | 700 | Cormorant Garamond |
| Label | 11-12px | 600-700 | System |
| Small/Caption | 10px | 500 | System |
| Section label | 11px | uppercase, 0.5px tracking | System |

## Color

### Approach: Balanced
Dual-accent system (gold for actions, crimson for warnings). Warm neutrals from deep void to warm ivory.

### The OaklandDusk Palette

**Backgrounds (darkest to lightest):**
| Token | Hex | Usage |
|-------|-----|-------|
| bg.void | #08070C | Global background |
| bg.card | #100C18 | Card containers, modals, tab bar |
| bg.surface | #180F20 | Text inputs, sheets |
| bg.border | #251810 | Borders, dividers |

**Brand (Port Rust + Sunset Gold):**
| Token | Hex | Usage |
|-------|-----|-------|
| brand.tagBg | #3A1808 | Deep tag background |
| brand.rust | #7A2420 | Rust accent (secondary highlight) |
| brand.gold | #C87828 | Primary CTAs, active tab, icon highlights |
| brand.sundown | #E0A030 | Hover/pressed states, secondary actions |
| brand.yellow | #F0C848 | Strongest emphasis, guide bubble background |

**Accents (Mural Rose + Indigo Night):**
| Token | Hex | Usage |
|-------|-----|-------|
| accent.roseBg | #3A0820 | Rose tag background |
| accent.rose | #8B3060 | Informational |
| accent.crimson | #C04858 | Errors, delete actions, low stock warnings |
| accent.indigoBg | #2A1860 | Indigo tag background |
| accent.indigo | #7868B8 | Info accent |

**Text (4-tier hierarchy):**
| Token | Hex | Usage |
|-------|-----|-------|
| text.primary | #F0E4C8 | Headings, titles (warm ivory) |
| text.secondary | #C8B898 | Body text, descriptions (parchment) |
| text.tertiary | #6A5040 | Secondary labels, inactive icons |
| text.disabled | #352A1E | Placeholder text, lowest contrast |

**Semantic:**
| Token | Hex | Usage |
|-------|-----|-------|
| semantic.success | #C87828 | Same as brand gold |
| semantic.warning | #E0A030 | Same as brand sundown |
| semantic.error | #C04858 | Same as accent crimson |
| semantic.info | #7868B8 | Same as accent indigo |
| ready (recipes) | #1D9E75 | Green for "ready to make" |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — dense but breathable
- **Primary gap:** 8px (most common in the codebase)
- **Screen padding:** 24px horizontal
- **Scale:** 2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 24 / 80 (safe area top)

## Layout
- **Approach:** Grid-disciplined
- **Structure:** Full-width cards, tab-based navigation, ScrollView content areas
- **Screen padding:** 24px horizontal
- **Card internal padding:** 14px vertical, 16px horizontal
- **Card gap:** 8px between cards

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| sm | 8px | Secondary buttons, small elements |
| md | 12px | Primary radius — cards, buttons, inputs |
| lg | 14px | Large cards, components |
| pill | 10px | Pill components |
| full | 999px | Fully rounded badges |

## Motion
- **Approach:** Minimal-functional
- **Principle:** Animations aid comprehension and provide feedback, never decorate
- **Easing:** Linear for simple fades, spring-like for bounces (Reanimated)
- **Patterns:**
  - Guide bubble bounce: 450ms up/down loop, 6px translateY
  - Banner fade: 300ms in, 200ms out, 5s visible
  - Toast fade: 300ms in, 500ms out, 2.5s visible
  - Slider snap: 80ms withTiming to nearest 5%
  - Button pressed: opacity 0.75

## Component Library
| Component | Location | Purpose |
|-----------|----------|---------|
| Card | components/ui/Card.tsx | Base card container with press state |
| Pill | components/ui/Pill.tsx | Status badge (ready/missing/default) |
| SectionLabel | components/ui/SectionLabel.tsx | Uppercase section divider |
| LevelRing | components/ui/LevelRing.tsx | Circular progress (inventory level) |
| SwipeRow | components/ui/SwipeRow.tsx | Swipeable list item (edit/delete) |
| GuideBubble | components/GuideBubble.tsx | Onboarding tooltip with bounce |
| LowStockBanner | components/LowStockBanner.tsx | Auto-dismiss alert banner |
| AddToInventoryModal | components/AddToInventoryModal.tsx | Full-screen page sheet modal |
| BottleFillSlider | components/BottleFillSlider.tsx | Gesture-driven fill level |

## Shadows
| Level | opacity | radius | offset | Usage |
|-------|---------|--------|--------|-------|
| Subtle | 0.15 | 4px | 0,2 | Cards |
| Medium | 0.25 | 10px | 0,4 | Banners, floating elements |
| Heavy | 0.4 | 12px | 0,4 | Modals |

## Interaction States
- **Pressed:** opacity 0.75 on Card pressables
- **Disabled:** opacity 0.4-0.7 depending on context
- **Loading:** Gold ActivityIndicator + descriptive text
- **Error:** Crimson text on rose background (soft, not alarming)
- **Empty:** Centered icon (48px, tertiary) + title + subtitle + optional CTA

## Accessibility
- **Touch targets:** 44px minimum (use hitSlop to pad small icons)
- **Color contrast:** text.primary on bg.void passes WCAG AA
- **Labels:** All interactive elements must have accessibilityLabel
- **Roles:** Pressable buttons use accessibilityRole="button"

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-27 | Initial design system created | Codified from existing OaklandDusk implementation by /design-consultation |
| 2026-03-27 | Dark mode only | Matches cocktail bar environment, stronger brand identity |
| 2026-03-27 | Serif body text (Cormorant Garamond) planned | Deliberate risk: literary premium feel for cocktail culture, unusual for mobile |
| 2026-03-27 | Bebas Neue display font planned | Condensed bold matches bartender/industrial energy |
| 2026-03-27 | 4px base spacing, 12px primary radius | Derived from codebase analysis of most common values |
