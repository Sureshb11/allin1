# Design System Document: The Kinetic Athlete

## 1. Overview & Creative North Star
**Creative North Star: "The Stadium Under Lights"**

This design system is built to capture the electric atmosphere of a night game—the deep shadows of the stands contrasted against the hyper-saturated glow of the field and the jumbotron. We are moving away from the "data-heavy spreadsheet" look of traditional sports apps and toward a high-end editorial experience.

To break the "template" feel, we embrace **Kinetic Asymmetry**. We use the `lexend` display face at aggressive scales to create a sense of forward motion. Layouts should feel like they are "in-play," utilizing overlapping containers, subtle glassmorphism, and tonal layering to provide depth without ever relying on static, structural lines.

---

## 2. Colors & Surface Philosophy
The palette is a high-contrast mix of deep night (`#0f131f`) and high-visibility signals.

### The "No-Line" Rule
**Borders are forbidden for sectioning.** To define boundaries, you must use color shifts between the `surface-container` tiers. 
- A live match card (`surface-container-high`) should sit atop the news feed (`surface-container-low`). 
- This creates a sophisticated, seamless UI that feels molded rather than assembled.

### Surface Hierarchy & Nesting
Treat the interface as a series of physical layers:
*   **Base Layer:** `surface` (#0f131f) – The foundation.
*   **Section Layer:** `surface-container-low` (#171b28) – For grouping related content areas.
*   **Component Layer:** `surface-container-high` (#262a37) – For interactive cards and modules.
*   **Highlight Layer:** `surface-bright` (#353946) – For momentary focus or hover states.

### The "Glass & Gradient" Rule
To inject "soul" into the dark mode:
*   **Glassmorphism:** For floating navigation or score overlays, use `surface-container` at 60% opacity with a `20px` backdrop-blur.
*   **Signature Textures:** Primary CTAs should not be flat. Use a linear gradient from `primary_container` (#0052ff) to `primary` (#b7c4ff) at a 135-degree angle to simulate the shimmer of technical sports apparel.

---

## 3. Typography
We use a dual-font strategy to balance aggressive energy with high-speed readability.

*   **Display & Headlines (Lexend):** This is our "Athletic" voice. It’s wide, bold, and unapologetic. Use `display-lg` for scores and `headline-lg` for breaking news.
*   **Body & Titles (Plus Jakarta Sans):** This is our "Technical" voice. It provides high legibility for player stats and play-by-play commentary.
*   **The Power Scale:** Don't be afraid of contrast. A `display-lg` score should sit right next to a `label-sm` "LIVE" indicator to create a professional, editorial hierarchy.

---

## 4. Elevation & Depth
In this design system, light is the architect, not lines.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface-container-highest` element placed on a `surface-dim` background creates a natural lift.
*   **Ambient Shadows:** When an element must float (e.g., a betting slip or player profile modal), use an extra-diffused shadow: `offset: 0 20px, blur: 40px, color: rgba(0, 0, 0, 0.4)`. 
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in a high-glare environment), use `outline-variant` at **15% opacity**. Never use a 100% opaque border.

---

## 5. Components

### Primary Buttons (The Action-Taker)
*   **Style:** High-energy. Use `secondary` (#ffb59e) or `tertiary` (#abd600) for peak "Action" moments.
*   **Shape:** `Roundedness.md` (0.375rem) for a modern, aggressive edge.
*   **Typography:** `label-md` in all-caps, bold, with 0.05em letter spacing.
*   **State:** On hover, apply a `primary_container` outer glow (8px blur) to simulate an illuminated scoreboard.

### Cards & Scoreboards
*   **Rule:** **Zero Dividers.** Use `Spacing.5` (1.1rem) to separate content.
*   **Structure:** Use `surface-container-high` as the card base. If the card contains "Sub-content" (like a box score within a game card), the inner section should transition to `surface-container-highest`.
*   **Interactive State:** On tap, the card should scale down slightly (98%) and shift to `surface-bright`.

### Input Fields
*   **Style:** Minimalist/Industrial. No background fill, only a `surface-container-highest` bottom-border (2px).
*   **Focus State:** The bottom border transforms into a `primary` gradient. The label floats and changes to `tertiary` (Lime Green) to signal "Active System."

### "The Momentum Meter" (Custom Component)
For live games, use a thin horizontal bar using `tertiary` and `secondary` to show which team has the current statistical advantage. This utilizes the "Action-Oriented" lime and orange to provide instant visual data.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use `tertiary` (#abd600) sparingly for "Live" or "Go" actions to maintain its high-energy impact.
*   **Do** use asymmetrical spacing (e.g., `Spacing.8` on the left, `Spacing.4` on the right) for news headlines to create a sense of motion.
*   **Do** embrace "Ink Traps" and wide tracking in display typography.

### Don't:
*   **Don't** use pure white (#ffffff) for text. Always use `on-surface` (#dfe2f3) to prevent eye strain in dark mode.
*   **Don't** use 1px dividers to separate list items. Use background-color stepping or `Spacing.px` gaps that reveal the `surface-lowest` background.
*   **Don't** use standard "Material" blue. Use the `primary_container` (#0052ff) for that deep, electric stadium feel.