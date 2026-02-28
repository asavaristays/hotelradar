# UI Visual Test Checklist

## Viewports
- 1440px: no overflow, all cards balanced in 3-column top row
- 1024px: no clipping in charts and panel headers
- 768px: stacked readable layout, no horizontal scroll
- 480px: touch targets >= 44px, accordion cards readable
- 375px: no overlap in header actions and market position labels

## Snapshot Targets
- Demand score card (Low/Moderate/High/Surge)
- Suggested pricing card with 3 bands
- Risk + heat + confidence card with urgency grid
- Market position bar markers and overlay label
- Signal breakdown bars
- Forward curve with weekend shading
- Competitive grid desktop table and mobile cards
- Alerts panel chips (Critical/High/Medium/Info)

## Accessibility
- Color contrast on all badges >= WCAG AA
- Keyboard focus visible on sort and collapse controls
- Table headers sticky and readable
- All chart cards include aria labels
