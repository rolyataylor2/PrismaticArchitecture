# Dashboard Design Standards

## Mission
Transform raw telemetry and JSON into a research-grade analytical workspace.

Prioritize comprehension, comparison, investigation, and trustworthy conclusions over the number of metrics displayed.

## 1. Discover the data before designing
Inspect real schemas and representative records.

Identify entities, relationships, timestamps, events, units, and missing data.

Define meaningful metrics and document any derived calculations.

Never invent measurements.

## 2. Design four information levels
- Overview: key results and significant changes.
- Analysis: trends, distributions, comparisons.
- Investigation: relevant events and supporting evidence.
- Raw data: searchable records and original JSON.

## 3. Select charts by purpose
- Trends → line charts.
- Comparisons → sorted bar charts.
- Distributions → histograms or box plots.
- Relationships → scatter plots.
- Event sequences → timelines.
- Dense relationships → heatmaps.
- Exact values → sortable tables.

Never create charts simply because data is available.

## 4. Establish a visual design system
Use consistent spacing, typography, colors, and components.

Favor a restrained, research-oriented aesthetic with strong visual hierarchy.

Avoid excessive cards, nested containers, decorative gradients, unnecessary shadows, and visual clutter.

Prioritize desktop analytical workflows while supporting smaller screens.

## 5. Design for investigation
Support linked filters, drill-downs, run comparisons, informative tooltips, and searchable records wherever useful.

Allow users to move from a summary to its original evidence.

Preserve selected filters and navigation context.

## 6. Protect analytical integrity
Display units, denominators, sample sizes, and baselines.

Distinguish observations from hypotheses.

Never imply causality without appropriate evidence.

Represent missing information accurately.

## 7. Separate data from presentation
Create a reusable semantic data layer between raw JSON and visualization components.

Keep metric definitions and calculations testable and independent of UI rendering.

Respect the existing framework and components.

## 8. Verify the rendered product
Launch the application and inspect screenshots.

Test desktop and mobile views, interactions, real records, loading states, and empty states.

Iterate until visual hierarchy and functionality meet the design goals.

## Definition of done
A researcher can understand current performance, identify meaningful changes, compare simulations, investigate anomalies, and verify conclusions without needing to read raw JSON.

## Dream run controls

Use the research-direction sidebar as the sole experiment selector. On experiment changes align its highlighted row with the top of that sidebar; preserve scrolling during ordinary refresh. Run set, run and evidence provenance filters live in one accessible popup opened by a filter icon beside the experiment title. Show one non-link Experiment overview label, without a duplicate breadcrumb link. Active dreams show completed-stage progress, the actual current model task, cooperative pause/resume and a Console button. The searchable console popup preserves chronological historical events and polls for live updates, with explicit rejected-learning and error messages. Progress is completed stages / protocol stages, never guessed model-call completion.

Dream run progress and controls appear at the top of Overview only. Criterion recurrence (What recurs, what wavers?) belongs to Conclusions, using the shared recurrence projection. Cognition across experience appears first in Execution with the same selected-run cohort, metrics and stage drill-downs.

The Part inspector includes source-disposition icons above its version timeline. Selecting an icon shows the disposition's current definition, activation evidence, development and preserved version history in the same detail pane. Part version selection restores perspective inspection. Disposition and Part versions remain distinct; missing bindings are explicit, embedded disposition information is read-only, and late responses cannot replace a newer selection.

Embedded disposition inspection opens on the current disposition version and displays one version at a time. Top-right previous/next controls browse preserved versions, label Current versus Historical, and disable at the ends of the recorded history. Activation statistics and charts retain their lifetime evidence scope.

Disposition directory tiles navigate to Part History with the disposition selected. The inspector uses the latest non-retired bound Part when available, otherwise the latest retired instance; dispositions without a bound Part retain the same disposition information and version navigation with an explicit empty Perspective History. There is no separate standalone disposition inspector. Directory pencil controls retain disposition editing.
