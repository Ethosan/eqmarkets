---
name: EQ Markets
description: A live macro dashboard for ES/NQ read like a ward observation chart, with each vital shown inside its own normal range.
colors:
  chart-paper: "#F4F5F1"
  sheet: "#FFFFFF"
  sheet-wash: "#EEF1EC"
  hairline: "#DCE1DA"
  hairline-strong: "#C3CBC2"
  deep-ink: "#13212B"
  ink-secondary: "#3F4D57"
  ink-muted: "#5B6771"
  clinical-teal: "#0B6E72"
  reading-up: "#18704A"
  reading-up-soft: "#E2F0E7"
  reading-down: "#B3322F"
  reading-down-soft: "#F7E2DF"
  amber-ink: "#85570A"
  band-amber: "#F6E5B0"
  band-red: "#F0C6C0"
  zone-amber: "#C98A12"
  zone-red: "#C23A33"
  group-rates: "#2D68A8"
  group-risk: "#7E4AA3"
  group-carry: "#24805F"
  group-commodities: "#A2651A"
  group-tape: "#4A6378"
typography:
  score:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "\"tnum\""
  display:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  value:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
  body-sm:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  bar: "2px"
  mark: "3px"
  stamp: "5px"
  tab: "8px"
  control: "9px"
  sheet: "12px"
  popover: "14px"
  dialog: "16px"
  pill: "999px"
spacing:
  hair: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  gutter: "32px"
  section: "36px"
components:
  sheet-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.sheet}"
    padding: "20px 22px"
  button-ink:
    backgroundColor: "{colors.deep-ink}"
    textColor: "{colors.chart-paper}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-ink-hover:
    backgroundColor: "{colors.clinical-teal}"
    textColor: "{colors.chart-paper}"
  button-ghost:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.sheet-wash}"
  status-pill:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "3px 11px"
    height: "30px"
  rail-tab:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.tab}"
    padding: "8px 10px"
    height: "40px"
  rail-tab-selected:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.deep-ink}"
  segmented-track:
    backgroundColor: "{colors.sheet-wash}"
    rounded: "{rounded.control}"
    padding: "3px"
  segmented-option-selected:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.deep-ink}"
    rounded: "7px"
    padding: "4px 14px"
    height: "32px"
  vital-row:
    textColor: "{colors.deep-ink}"
    padding: "9px 16px"
    height: "60px"
  vital-row-hover:
    backgroundColor: "{colors.sheet-wash}"
  change-pill-amber:
    backgroundColor: "{colors.band-amber}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.stamp}"
    padding: "2px 7px"
  change-pill-red:
    backgroundColor: "{colors.band-red}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.stamp}"
    padding: "2px 7px"
  stale-stamp:
    textColor: "{colors.amber-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.stamp}"
    padding: "1px 7px"
  chip:
    backgroundColor: "{colors.sheet-wash}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.stamp}"
    padding: "2px 8px"
  detail-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.dialog}"
    padding: "22px 24px 24px"
    width: "680px"
---

# Design System: EQ Markets

## Overview

**Creative North Star: "The Observation Chart"**

EQ Markets reads the market the way a ward nurse reads a patient chart. Every vital sits inside its own banded normal range from its past year, and the Risk Appetite Index is the early-warning score. The ground is chart paper in light mode and a night-ward slate in dark mode. Content sits on white sheets edged with hairline rules, the type is deep ink, and one clinical teal marks selection and focus. Colour is reserved for readings that are unusual. A quiet chart means a normal market.

Density is high and calm. The desktop shell is a section rail plus a status strip over a fluid work column that fills the screen (centered on the paper past 2080px). Panels are flat sheets, and the vitals are one long ruled table per indicator group. Hierarchy comes from scale and weight on a 4px rhythm. Weight does the work that boxes and fills would do elsewhere. The theme follows the system unless the user picks one. Both themes are first-class and share every rule.

The world rejects the category default, which is a dark terminal of tiles with green and red on every number. A day's change is plain ink unless the move is rare for that market.

**Key Characteristics:**
- Chart-paper ground, white sheets, 1px hairline rules, no heavy boxes.
- One teal, used only for selection, focus and links.
- Amber and red appear only as band tints and zone marks for out-of-range readings.
- One hue per indicator group, carried everywhere that group appears.
- Public Sans with tabular figures throughout; scale contrast, not colour, makes the hierarchy.
- Stale or missing data is stamped in place, never blanked or hidden.

## Colors

A near-neutral clinical palette with one teal, a two-step alert ladder (amber, red) and five muted group hues. Every colour has one job. The night-ward dark theme redefines every token under the same name (values in the sidecar). Neither theme is a filter applied to the other.

### Primary
- **Clinical Teal**: the only interactive accent. Used for the focus ring (2px outline, 2px offset), links, text selection, the selected bias-table row (a soft teal wash fading right), the feed progress bar, the tour spotlight ring, the active tour dot and the hover state of the ink button. The risk-on end of the score track tints toward it.

### Secondary (alert ladder)
- **Band Amber / Band Red**: the soft tints behind out-of-range readings. Used for the lit band in a vital track, the day-change pill when a move exceeds 2σ (amber) or 3σ (red) of a normal day, the score label and the regime-map quadrant.
- **Zone Amber / Zone Red**: the saturated marks. Used for the end dot of a vital track, the read-list bullet and the regime history strip.
- **Amber Ink**: readable amber for text. Used for stale stamps, the feed-warning stamp, "medium" confidence and pending notes.

### Tertiary (direction and groups)
- **Reading Up / Reading Down** (with soft washes): direction where direction is the message. Used for reading notes, contribution bars, bias lean, the detail-sheet change, the live dot and the value flash on update.
- **Group hues: Rates blue, Risk violet, Carry green, Commodities ochre, Tape slate.** Used for the rail swatch, the row dot, the group-heading square and the detail chart line.

### Neutral
- **Chart Paper**: the page ground, the rail and the sticky group signage.
- **Sheet**: every container (cards, vitals table, dialogs, status pills, selected tab).
- **Sheet Wash**: hover rows, segmented-control tracks, chips, the AI explanation well and quiet (unlit) bands.
- **Hairline / Hairline Strong**: all rules and borders; the strong step for control borders and axes.
- **Deep Ink / Ink Secondary / Ink Muted**: primary text and values, supporting text, captions and labels.

### Named Rules
**The Quiet Band Rule.** Bands rest in grey. Only the band holding the latest reading lights amber or red, and a change pill is coloured only when the move is rare (amber beyond 2σ, red beyond 3σ). If every row is coloured, the chart has stopped working.

**The One Teal Rule.** Teal means "selected, focused, you are here, or follow this" (including the regime map's current point). Apart from the risk-on end of the score track, it is never a fill, a chart series or a status colour.

**The Group Hue Rule.** Each group has exactly one hue, and it marks that group wherever the group appears: rail, row dot, heading square and detail chart. Group hues never carry state.

## Typography

**Display Font:** Public Sans (with -apple-system, Segoe UI, system-ui, sans-serif)
**Body Font:** Public Sans (same stack)

**Character:** A single civic grotesque in four weights (400–700). It is plain enough to be read off a chart at a glance. Tabular figures are set on the body so every column of numbers aligns.

### Hierarchy
- **Score** (700, 56px, line-height 1, -0.035em; 42px below 720px): the Risk Appetite Index number only.
- **Display** (700, 36px, -0.03em; 30px on phones): the value in the detail sheet.
- **Headline** (600, 30px, 1.1): a model's headline value inside a card.
- **Value** (600, 22px, -0.02em): regime label, detail-sheet name. Vital-row values use 17px/600.
- **Title** (600, 17px, -0.015em): card titles, group headings, tour titles, the brand.
- **Body** (400, 15px, 1.5; reading prose at 1.55–1.6): the read list, bias lede, guide and tour text. Prose is capped at 60–78ch.
- **Body small** (13px): row names, status strip, notes, stats, contribution labels.
- **Label** (600, 12px): column heads, legends, stamps, chart captions. Sentence case, never tracked uppercase.

### Named Rules
**The 12px Floor Rule.** Nothing functional is set below 12px. The 11px chart axis ticks are the single exception.

**The Tabular Rule.** Every number uses tabular figures and a true minus sign (−1.20). The sign comes before any prefix (−$1.20, not $-1.20).

## Layout

The desktop shell is a two-column grid. A sticky 232px rail on chart paper holds the brand, Overview, Models & flows and the five group tabs, and is divided from the work area by a hairline. Above the work column sits a sticky 56px status strip on 92% paper with a 10px blur. The work column fills the space beside the rail; the whole shell is capped at 2080px and centered on the paper beyond that, so wide screens gain symmetrical margins instead of a dead right edge. Its side gutter is 32px, stepping to 40px at 1440px and up, and the status strip, work column and footer all share it.

The models area is a 12-column grid with a 20px gap. From 1600px the score, Today's read and the bias sit in one row of three equal cards; below that the score spans 5 columns and two rows with the read and bias stacked beside it. At 1180px and below every model card goes full width. At 720px and below card padding drops to 18px/16px and inner grids stack.

Below 960px the same DOM flattens. The rail becomes a horizontally scrolling row of sticky section tabs under a 52px top bar. Clocks hide, and the feed summary shortens to a stamp. Each vital row reflows from five columns (name, value, today, track, reading) to two (name/value, track/pill, then reading).

Group headings are sticky one-line signage on the paper ground. The spacing rhythm is 4px. Common steps are 8, 12, 16, 20, 24 and 32, with 36px between groups.

## Elevation & Depth

The system is flat. Depth comes from tone: sheet on paper, a hairline edge and a wash on hover. Resting cards and the vitals table carry no shadow. Shadow appears only on the selected rail tab and on things that float above the page: dialogs, the tour popover, the install bar and the chart tooltip.

### Shadow Vocabulary
- **Lift** (`0 1px 2px rgba(19,33,43,.05), 0 6px 18px -8px rgba(19,33,43,.12)` light; `0 1px 2px rgba(0,0,0,.3), 0 10px 24px -10px rgba(0,0,0,.5)` dark): the selected rail tab (with a 1px inset hairline) and the chart tooltip.
- **Float** (`0 24px 60px -12px rgba(0,0,0,.35)`): the detail sheet and guide dialog over the scrim.
- **Halo** (`0 0 0 2px` sheet colour): separates the score needle and the track end dot from what lies beneath.

### Named Rules
**The Flat Sheet Rule.** A sheet at rest has a hairline and no shadow. If something casts a shadow, it is either selected or floating.

## Shapes

Shapes are softly rounded, getting rounder as an element gets more transient. Data marks are nearly square (2–3px bars and group swatches). Stamps, chips and change pills use 5px. Tabs and segmented options use 7–9px. Sheets use 12px, popovers 14px and dialogs 16px (18px top corners as a phone bottom sheet). Status pills and the guide nav are fully round. Group identity is always a small rounded square, never a circle. Circles are reserved for live and status dots, the track end dot and the help button.

## Components

### Buttons
Buttons are plain and firm.
- **Shape:** gently rounded (9px), 40px tall (44px on phones).
- **Primary (ink):** deep ink fill with paper text, 13px/600. Hover turns teal.
- **Ghost:** sheet fill with a strong hairline border. Hover gives a wash and a muted-ink border.
- **Icon / Guide buttons:** 36px round sheet pills with a hairline border and 17px inline SVG icons.

### Chips and Pills
- **Data chip:** sheet-wash, 5px, 12px tabular text with the value bolded in ink.
- **Status pill:** round sheet pill, a 7px state dot (up = open, amber = mid-session, muted = closed).
- **Age tag:** a round outline with 12px/600 text. "Today" and "new" invert to an ink fill.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** sheet on paper.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px hairline. Sections inside a card are divided by hairline rules, not nested boxes.
- **Internal Padding:** 20px × 22px (18px × 16px on phones).
- **Disclosure:** secondary detail sits in a hairline-topped disclosure with a 13px/600 summary and a drawn chevron.

### Segmented Controls
A sheet-wash track with 3px padding. The selected option is a sheet tile with a faint lift. Used for the ES/NQ switch and detail-chart ranges, and stretched to full width on phones.

### Navigation
- **Rail:** 15px/500 secondary-ink rows, 40px tall, each with a 10px group swatch. Hover gives a wash. The selected row is a sheet tile with an inset hairline and lift, at 600.
- **Mobile:** the rail becomes sticky horizontal tabs on 94% paper with blur, 13px, 8px swatches.

### Vital Row (signature)
Each group is one ruled sheet table, one 60px row per indicator: group dot, ticker in 700 and name, then 1M change and σ in 12px muted text. Next come the value (17px/600, right-aligned), today's change pill (ink, tinted only beyond 2σ/3σ) and the banded vital track. The track shows three months of trace in ink, drawn over the past year's bands. The outer 10% is amber, the outer 2.5% red and the median is a dotted rule. Only the band holding the latest reading lights up, and a 9px end dot takes that zone's colour. A one-line reading closes the row. The whole row is a button that opens the detail sheet.

### Stale Stamp (signature)
A missing or stale reading keeps its row. The value greys and the reading becomes a 5px bordered stamp in amber ink ("Last good value · source retrying") or muted ink ("No data · retrying"). The feed-health summary in the status strip uses the same stamp.

### Score Track
The Risk Appetite Index scale is a 14px banded strip: red, amber, white normal zone, teal-soft and then stronger teal toward risk-on. It has tick rules at the normal-zone edges and a 4px ink needle with a sheet halo.

### Detail Sheet
A 680px dialog on sheet over the scrim (bottom sheet with a grab handle on phones). The name is 22px and the value 36px. Range segments sit above an interactive chart drawn in the group hue, with a dotted median and a shaded middle 80%. Stats sit in a hairline grid, followed by a teal source link.

## Do's and Don'ts

### Do:
- **Do** keep every container a sheet with a 1px hairline and a 12px radius, and divide its contents with hairline rules.
- **Do** colour a reading only when it sits outside its normal band: band-amber tint beyond the 10th/90th percentile or 2σ, band-red beyond the 2.5th/97.5th or 3σ.
- **Do** carry a group's single hue on every surface that group appears: rail, row dot, heading square and detail chart line.
- **Do** set every number in tabular figures with a true minus sign.
- **Do** stamp stale or missing data in place with what is wrong, in amber or muted ink.
- **Do** define every colour in both themes under the same token name.

### Don't:
- **Don't** colour a day's change green or red by direction alone; it stays ink unless the move is rare.
- **Don't** use teal for anything but selection, focus, links and the risk-on end of the score track.
- **Don't** put a shadow on a resting card or table.
- **Don't** blank, hide or drop a row whose feed failed.
- **Don't** set functional text below 12px or use tracked uppercase labels.
- **Don't** reuse a group hue for state, or a state colour for a group.

### Exception
The admin-only backtest lab (`?admin=1&tab=lab`) predates this world. It always renders on the night-ward palette inside a paper-on-paper panel, whatever the theme. It is outside this system and is not a pattern for new surfaces.
