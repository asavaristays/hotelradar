# Radar Dashboard Component Hierarchy

## App Shell
- `App`
- `LoginPage`
- `DashboardPage`

## Dashboard Composition
- `Dashboard`
- `DemandScoreCard`
- `SuggestedPricingCard`
- `ConfidenceCard`
- `MarketUrgencyGrid`
- `MarketPositionBar`
- `SignalBreakdownChart`
- `StabilityCard`
- `ForwardDemandChart`
- `CompetitiveGrid`
- `CompressionSnapshot`
- `AlertsPanel`
- `InsightsCard` (inside `Dashboard`)
- `PerformanceCard` (inside `Dashboard`)

## Layout Rows
- Row 1: Demand Score | Suggested Pricing | Risk + Heat + Confidence
- Row 2: Market Position (full width)
- Row 3: Signal Breakdown | Market Stability
- Row 4: Forward Demand Curve (full width)
- Row 5: Competitive Grid | Compression Snapshot
- Row 6: Narrative Summary | Alerts
- Row 7: Performance Summary
