---
name: Premium Sporty
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434656'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#2352d7'
  primary: '#0041c8'
  on-primary: '#ffffff'
  primary-container: '#305ce1'
  on-primary-container: '#e3e6ff'
  inverse-primary: '#b6c4ff'
  secondary: '#406900'
  on-secondary: '#ffffff'
  secondary-container: '#bdf37b'
  on-secondary-container: '#447000'
  tertiary: '#474f65'
  on-tertiary: '#ffffff'
  tertiary-container: '#5f677e'
  on-tertiary-container: '#e0e6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b3'
  secondary-fixed: '#bdf37b'
  secondary-fixed-dim: '#a2d662'
  on-secondary-fixed: '#102000'
  on-secondary-fixed-variant: '#2f4f00'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2f'
  on-tertiary-fixed-variant: '#3e465c'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The brand personality is authoritative yet energetic, designed specifically for the high-intensity environment of live cricket. It targets active players and spectators who require immediate information density and extreme legibility, especially when used outdoors. 

The aesthetic is **Premium Sporty**, characterized by high-contrast visual hierarchies, a clean "White Stadium" background, and vibrant action signals. The design draws from **Modern Minimalism** for its structure, using generous whitespace to prevent cognitive overload, while incorporating **Tonal Layers** to create a sense of depth and focus without relying on heavy textures that might wash out in direct sunlight.

The emotional response should be one of precision, excitement, and reliability.

## Colors

The palette is engineered for maximum contrast (WCAG AAA compliance where possible) to ensure readability under direct sunlight.

- **Primary (Electric Blue):** Used for primary actions, CTA buttons, and interactive states. It provides a sharp, digital energy against the white background.
- **Secondary (High-Viz Green):** A vibrant, lighter lime green reserved for "Live" indicators, success states, and progress bars. It provides maximum pop against dark surfaces and echoes the luminosity of a sunlit pitch.
- **Tertiary (Deep Navy/Slate):** The primary color for typography and iconography. It offers a softer, more premium alternative to pure black while maintaining maximum contrast against white.
- **Neutral (Cloud White):** The base surface. A very light gray (`#f8fafc`) is used for card backgrounds to distinguish them slightly from the pure white (`#ffffff`) page background.
- **Accent (Signal Red):** Used sparingly for critical "Live" alerts and score highlights.

## Typography

The typography system uses **Hanken Grotesk** for headings and labels to convey a modern, technical, and sporty feel. **Inter** is utilized for body copy due to its exceptional legibility and neutral tone, which balances the expressive nature of the headlines.

For outdoor usability, font weights are intentionally heavier (Bold/ExtraBold) for scores and critical data points. Tracking is slightly tightened on large headlines for a "compact" sporty look, while labels use expanded tracking and uppercase styling to ensure they remain legible even at small sizes or when the screen is dimmed.

## Layout & Spacing

This design system utilizes a **Fixed-Fluid Hybrid Grid**. On mobile, it employs a 4-column layout with 16px margins. On desktop, it expands to a 12-column grid with a max-width of 1280px.

The spacing philosophy follows a strict **4pt grid system** to maintain mathematical harmony. To optimize for outdoor use, "Breathable Density" is prioritized. Elements are given generous internal padding within cards to prevent visual crowding, which can make a screen look "muddy" in bright light. 

**Reflow Rules:**
- **Mobile:** Cards are full-width or scroll horizontally (Snap-carousel) for match lists.
- **Tablet:** 2-column card masonry.
- **Desktop:** Multi-column dashboard view with a fixed left-hand navigation and contextual right-hand sidebar for live scores.

## Elevation & Depth

To maintain high contrast, depth is communicated through **Soft Ambient Shadows** and **Tonal Layering** rather than heavy gradients.

- **Level 0 (Background):** Pure White (`#FFFFFF`).
- **Level 1 (Cards/Surfaces):** Off-white (`#F8FAFC`) with a subtle 1px border (`#E2E8F0`).
- **Level 2 (Hover/Active):** These surfaces use a low-opacity, extra-diffused shadow (Blur: 15px, Y: 4px, Color: `rgba(15, 23, 42, 0.08)`) to appear lifted.
- **Level 3 (Modals/Overlays):** Stronger shadows with a 20% backdrop blur (Glassmorphism) to keep the user oriented within the live match context while focusing on the specific task.

Icons and buttons use "Optical Punch"—slight inner shadows or high-contrast borders—to ensure they look interactable even when the user's pupils are constricted by bright sunlight.

## Shapes

The shape language balances "Sporty Precision" with "Premium Approachability." 

- **Primary Containers:** 0.5rem (8px) corner radius for a structured, modern feel.
- **Interactive Elements:** Buttons and Input fields use a 0.5rem radius to match the containers.
- **Status Tags/Chips:** Full pill-shape (32px+) to distinguish them as non-structural, purely informational elements.
- **Team Avatars:** Circular shapes to provide a soft counterpoint to the predominantly rectangular grid.

## Components

### Buttons
- **Primary:** Solid Electric Blue with Bold White Inter text. High-contrast, 56px height for easy tapping during movement.
- **Secondary:** Outlined Deep Navy with 1.5px stroke width.
- **Floating Action Button (FAB):** Electric Blue with a sharp white icon and a prominent shadow to ensure it "floats" above the content.

### Cards
Cards are the primary vessel for information. They feature 16px internal padding and a subtle `#E2E8F0` border. Match cards include a secondary-colored (High-Viz Green) "Live" indicator in the top right, utilizing a pulsing animation for urgency.

### Chips & Badges
Used for "Live," "Upcoming," or "Finished" match statuses. They use high-chroma backgrounds with high-contrast text. For "Live" states, the High-Viz Green background ensures the badge is the most prominent secondary element on screen.

### Progress Bars (Innings/Overs)
Utilize the High-Viz Green for the progress fill against a light gray track. The bar is 8px thick to ensure visibility from a distance.

### Lists
Player and score lists utilize generous vertical padding (12px) and hairline dividers (`#F1F5F9`) to ensure the eye can track data across rows without losing its place in bright environments.

### Input Fields
Clean white backgrounds with a 1.5px navy border on focus. Labels are always persistent (not floating) above the field to ensure clarity.