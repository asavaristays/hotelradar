# HotelRADAR Product Roadmap

Last updated: March 2026

## Product Summary

HotelRADAR is a demand intelligence and pricing recommendation system for hotels in India.

It combines:
- competitor pricing
- OTA parity
- city events
- holidays
- airfare movement
- seasonality
- market positioning

into a daily pricing decision for hotel owners and revenue teams.

Current market focus:
- Goa
- Mumbai
- Jaipur

Product position:
- AI-assisted pricing cockpit
- advisory system
- not an autonomous rate publishing engine
- not a PMS
- not a channel manager

## Who Uses HotelRADAR

Primary users:
- hotel owners
- revenue managers
- general managers
- cluster commercial heads
- operations admins and super admins

Best-fit customers now:
- independent hotels
- boutique chains
- regional hotel groups
- city and leisure hotels with active pricing management

## What Exists Today

Core product capabilities already built:
- demand score engine
- forward 30-day demand curve
- suggested pricing output
- market position vs market average
- competitor rate grid
- OTA parity panel
- signal breakdown
- risk / heat / confidence scoring
- narrative explanation layer
- data health diagnostics
- alerting
- admin management workflows
- event collection and ingestion pipeline
- recalculation queue / worker pattern
- product lock / verify / actionable readiness flow

Operational capabilities already present:
- PM2-based production runtime
- VPS deployment flow
- health and readiness endpoints
- calibration settings API
- outcome CSV ingestion endpoint
- nightly calibration script

## Active Production State

Active cities:
- Goa
- Mumbai
- Jaipur

Active live / demo focus:
- The Oberoi Mumbai
- Goa live properties
- Jaipur live properties

Known operating realities:
- OTA parity can fall back to estimated mode when scraped channel rows are missing
- forecast accuracy and rolling accuracy are still calibration-sensitive
- event data quality depends on both code and shared snapshot files
- local code and VPS code can drift if deployment is not controlled

## What Has Been Achieved So Far

Major functional progress:
- multi-signal demand scoring is live
- signal breakdown includes event-sensitive components
- stay-date-driven dashboard interaction is live
- forward demand curve hover and pricing context are live
- OTA live row support is integrated into production workflows
- wedding and corporate/event signal paths are present
- admin calibration controls are wired
- product lock logic is implemented
- event ingestion pipeline supports collection, snapshot ingestion, and admin entry

Recent stabilization improvements:
- production frontend drift was diagnosed and corrected
- stay-date controls were shipped to production
- manual signal control container was removed from the dashboard UI
- bad IPL pre-season dates were blocked locally in event validation logic
- targeted event ingestion and event collection tests were added for blocked IPL rows

## Current Product Strengths

What is already strong:
- directional pricing guidance
- event-aware market context
- transparent signal explanation
- actionable dashboard output for specific stay dates
- clear positioning vs market
- strong production utility for Goa, Mumbai, and Jaipur

What gives the product value today:
- replaces fragmented manual rate checks
- highlights underpricing and parity issues
- surfaces demand spikes before the market fully reacts
- gives a structured explanation instead of a black-box number

## Current Weaknesses

Highest current gaps:
- OTA reliability still depends on scrape freshness and channel coverage
- calibration loop is not yet mature enough to claim strong forecast accuracy
- production data quality can still be polluted by stale shared snapshot files
- deployment workflow is not yet fully protected from local/VPS mismatch
- admin cleanup workflows for bad operational data still need improvement

## Product Priorities

Work should be prioritized in this order:

1. Data correctness
2. Dashboard trust and clarity
3. Deployment reliability
4. Calibration loop quality
5. Notification and automation
6. Portfolio and chain workflows

## Roadmap

### Phase 1: Stabilize Goa, Mumbai, and Jaipur

Objective:
- make the current production scope reliable enough for repeated demos and paid use

Priority work:
- improve OTA parity trust and mismatch clarity
- prevent bad event dates from entering the system
- harden deployment workflow
- clean stale alert behavior
- keep dashboard outputs stable across refresh and deploy

Success criteria:
- no major data contradictions in dashboard output
- no stale or obviously invalid event signals
- reliable deploys without manual bundle drift

### Phase 2: Close the Calibration Loop

Objective:
- move from directional trust to measurable outcome trust

Priority work:
- expand actual outcome ingestion
- evaluate predicted vs actual rate performance
- refresh rolling forecast accuracy
- make confidence mode reflect real evidence, not only heuristics

Success criteria:
- stable sample of validated outcomes
- rolling accuracy metric becomes meaningful
- confidence / verify state is tied to real operating evidence

### Phase 3: Add Daily Revenue Operations Automation

Objective:
- reduce dashboard dependency by pushing action to the user

Priority work:
- daily digest delivery
- surge alerts
- parity mismatch alerts
- operator-facing morning task flow

Success criteria:
- a revenue manager can act without opening the dashboard first
- high-opportunity dates trigger timely action prompts

### Phase 4: Expand Market Coverage Carefully

Objective:
- add new cities only after the current production scope is operationally repeatable

Likely next markets:
- Delhi NCR
- Bengaluru
- Hyderabad
- Jaipur
- Pune

Expansion rule:
- city-by-city rollout only
- each city must have curated competitor scope, event behavior, and operating baselines

### Phase 5: Portfolio and Chain Features

Objective:
- support hotel groups once single-property trust is established

Priority work:
- portfolio summary view
- multi-property alerts
- group-level parity and demand reporting
- cluster revenue workflows

## Immediate Backlog

Near-term engineering backlog:
- improve OTA parity mismatch detection and recommendation language
- strengthen live OTA refresh reliability
- add safer event correction and cleanup workflows
- improve alert expiry rules for time-sensitive alerts
- strengthen calibration outcome ingestion
- add a safer deploy workflow that prevents shipping the wrong code

## Deferred Until Product Maturity

These are explicitly lower priority until the live product is stable and enough real outcomes exist:
- automatic rate publishing
- full PMS integrations
- national rollout
- native mobile app
- large ML retraining pipelines
- enterprise benchmarking products

## Product Guardrails

These rules should remain true:
- no automatic publishing to OTA or PMS
- suggested pricing stays within sane bounds
- stale competitor data must be treated visibly as stale
- bad future event dates must be blocked
- narrative must explain why the score exists
- OTA parity gaps above tolerance are operationally important

## Success Definition

HotelRADAR is successful when a hotel can:
- understand demand for a given stay date
- see whether it is under market or over market
- understand the top drivers behind the recommendation
- identify revenue leakage from parity issues
- act on high-opportunity dates with confidence

In the near term, success is not full automation.

Success is:
- trusted recommendations
- reliable daily intelligence
- clear explanation
- repeatable pricing wins in Goa and Mumbai
