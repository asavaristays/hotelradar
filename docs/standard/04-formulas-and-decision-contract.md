# Formula and decision contract

## Approved action vocabulary

Supported client-facing actions:

- Need More Data
- Hold / Watch
- Increase Watch
- Reduce Watch
- Increase
- Reduce
- Close Discount
- Minimum Stay
- Close Out

The product should avoid extra action labels unless the Central Intelligence contract is deliberately updated.

## Confidence bands

Confidence is not just a visual score. It controls what action is allowed.

| Confidence | Allowed output |
| --- | --- |
| below 40 | Need More Data |
| 40-59 | Hold / Watch |
| 60-74 | Increase Watch or Reduce Watch only |
| 75+ | Strong action only if all required evidence exists |

## Strong action requirements

Strong actions require:

- own hotel rate;
- sufficient competitor evidence;
- sufficient OTA evidence;
- fresh observations;
- valid normalization;
- no critical data-health issue;
- no unresolved contradictory signal.

If confidence is high but required evidence is missing, the system must lock strong action and output a watch action instead.

## Missing numeric values

Missing numeric values must stay missing:

- missing own rate: `null`;
- missing market rate: `null`;
- missing suggested price: `null`;
- missing market position: `null`.

Render missing values as:

- `Not captured`;
- `Unavailable`;
- `Needs data`.

Never render missing numeric values as zero.

## Evidence readiness model

Each signal should classify as:

- `ready`: enough evidence for decision;
- `supporting`: useful signal but not sufficient alone;
- `stale`: captured but too old;
- `missing`: required or desired signal not captured;
- `blocked`: source cannot be used due to access, legal, provider, or technical constraint.

## Indicative formula structure

The current working model combines:

```text
readiness_score =
  weighted official rate readiness
+ weighted OTA evidence readiness
+ weighted competitor evidence readiness
+ weighted market price readiness
+ event and holiday support
+ travel/search support
+ MICE support
+ wedding support
+ risk/weather support
+ freshness readiness
```

Pricing direction considers:

- demand score / demand level;
- hotel position versus normalized market;
- event pressure;
- market softening or strengthening;
- evidence completeness.

Guardrail:

```text
if required evidence is not ready:
  downgrade strong action to watch action
```

## Contradictory signal rule

If signals conflict, for example events show demand but competitor prices soften, the product must explain the contradiction and avoid strong action until resolved.

## Output standard

Every recommendation should explain:

- the action;
- confidence;
- evidence that supports it;
- missing evidence;
- risk;
- owner/team action.
