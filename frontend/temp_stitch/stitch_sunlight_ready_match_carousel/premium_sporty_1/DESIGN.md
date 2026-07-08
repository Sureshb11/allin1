---
name: Premium Sporty
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#ffffff'
  on-tertiary: '#2f3131'
  tertiary-container: '#e2e2e2'
  on-tertiary-container: '#636565'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Anybody
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Anybody
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Lexend
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Lexend
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-bold:
    fontFamily: Lexend
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  data-viz:
    fontFamily: Anybody
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for high-performance athletic environments, focusing on "Premium Sporty" aesthetics that bridge the gap between luxury gear and technical precision. The brand personality is energetic, disciplined, and elite. It is designed for athletes and high-achievers who require immediate data recognition under taxing physical conditions.

The visual style follows a **High-Contrast / Bold** movement with subtle **Modern** influences. It prioritizes extreme legibility and "at-a-glance" comprehension. The interface should feel like a piece of high-end equipment—sturdy, responsive, and visually striking. By utilizing a "Radium Green" accent against deep, obsidian neutrals, the design system ensures maximum visibility in both low-light gym environments and high-glare outdoor sunlight.

## Colors
The color palette is anchored by **Radium Green (#CCFF00)**, a high-visibility fluorescent hue optimized for sunlight readability and performance tracking. This color is the primary driver of action and attention.

- **Primary (Radium Green):** Used for critical data points, primary actions, and active states. It replaces all traditional green tones to ensure a unified, high-octane visual language.
- **Surface & Backgrounds:** A deep Obsidian (#0F0F0F) is used for the base to minimize glare and maximize the luminance of the Radium Green accents.
- **Contrast:** High-purity White (#FFFFFF) is used for primary typography to maintain a AAA accessibility rating against the dark backgrounds.
- **Accents:** Secondary surfaces use a slightly lighter Slate Gray (#1A1A1A) to create subtle depth without sacrificing the aggressive, monochromatic foundation.

## Typography
Typography in this design system is built for speed. **Anybody** is utilized for headlines and data displays; its variable width and aggressive weights evoke a sense of movement and technical power. All display headers should be set in uppercase to reinforce the "premium equipment" feel.

**Lexend** is chosen for body copy and labels. Its design is specifically tailored to reduce cognitive load and improve reading speed, which is critical during high-intensity activity. 

For data visualization (heart rates, lap times, weights), use the `data-viz` token. This ensures that the most important metrics are the most legible elements on the screen.

## Layout & Spacing
The layout philosophy is based on a **Fixed Grid** for content containers with a fluid 12-column system for internal elements. The spacing rhythm follows a strict 4px baseline grid, ensuring that every element feels intentional and engineered.

- **Desktop:** 12-column grid, 32px side margins, 24px gutters.
- **Mobile:** 4-column grid, 16px side margins, 16px gutters.
- **Safe Areas:** For wearable or handheld sports devices, content is inset by an additional 8px to ensure touch targets are not missed during movement.

Layouts should favor verticality, allowing users to scroll through metrics quickly. Large, "glanceable" cards should span full widths on mobile to maximize the touch area.

## Elevation & Depth
In this design system, depth is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than traditional shadows. Shadows are avoided to maintain a "flat and fast" look that performs better in bright sunlight.

- **Base Layer:** Obsidian (#0F0F0F).
- **Surface Layer:** Dark Slate (#1A1A1A). Used for cards and containers.
- **Border Treatment:** Instead of shadows, use 1px solid borders in Radium Green at 20% opacity to define card edges.
- **Active State:** Use a 2px solid Radium Green border at 100% opacity to indicate focus or selection.
- **Overlays:** Use 80% opacity Obsidian with no background blur to maintain maximum contrast for modals.

## Shapes
The shape language is "Soft" (0.25rem/4px) to reflect precision-machined edges. Avoid fully rounded/pill shapes except for secondary tags or indicators. The 4px radius provides just enough softness to feel modern while maintaining a sharp, aggressive professional edge. 

- **Primary Buttons:** 4px radius.
- **Cards:** 8px radius (`rounded-lg`).
- **Data Containers:** 0px (sharp) to suggest a more technical, modular "grid" feel.

## Components
Consistent styling of components ensures the "Premium Sporty" feel is maintained across the entire experience:

- **Buttons:** Primary buttons use a solid Radium Green background with Black text (#000000) for maximum contrast. Secondary buttons use a ghost style with a Radium Green outline.
- **Chips/Tags:** Use Radium Green backgrounds at 15% opacity with Radium Green text. This creates a "glow" effect that highlights status without overpowering primary actions.
- **Input Fields:** Dark backgrounds (#0A0A0A) with a 1px Radium Green bottom border. On focus, the border thickness increases to 2px.
- **Cards:** Utilize the Surface Layer color (#1A1A1A). Headlines inside cards should always be paired with a Radium Green accent icon or line-indicator on the left edge.
- **Checkboxes/Radios:** When active, these are filled with solid Radium Green. Use a "check" icon in Black for visibility.
- **Progress Bars:** Backgrounds are 10% Radium Green; the active fill is 100% Radium Green. For critical performance metrics, the progress bar should have a slight outer glow effect in the UI.