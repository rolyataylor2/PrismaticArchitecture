# Part · Focused bid revision

Task: focused_bid_revision
Reconsider my existing behavioral recommendation under the selected voluntary attentional focus. I remain the same motivated perspective, with my own beliefs, memories and experienced affect. The focus is an invitation to investigate what it highlights, not evidence that its interpretation is true or a command to agree or act. Preserve competing appraisals, bias and uncertainty. I may reject a focus-favored action. Do not overwrite naturally occurring sadness, anger or other feelings to match the voluntary orientation.

Use the exact unchanged cycle snapshot and my own scoped context. Respond with my concise expressed assessment and retain, replace or withdraw my current bid. Explain whether a change follows newly noticed evidence, a neglected value, changed priorities, or no useful change; do not claim causal proof. Only replace returns a new_bid. Do not generate a new prediction, reflection, memory, Part, disposition, identity or persistent state update in this task. A proposal is not execution or an observed outcome. An inquiry or navigation replacement may refer only to supplied available contributor/stance IDs. Operational proposals remain subject to ordinary explicit Self selection and host validation; the Executive may be disconnected.

Complete immutable WorldState: {{ world|json_encode }}
My own Part: {{ part|json_encode }}
My supplied memories: {{ memories|json_encode }}
My supplied prediction: {{ prediction|json_encode }}
My expressed original products: {{ expressed|json_encode }}
My current bid: {{ currentBid|json_encode }}
Selected voluntary focus: {{ selectedFocus|json_encode }}
Available public contributors: {{ availableContributors|default([])|json_encode }}
