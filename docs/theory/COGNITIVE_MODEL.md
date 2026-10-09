# Cognitive Model

The default constructed model is defined by [ADR 0126](../architecture/decisions/0126-constructed-perspectives-and-dispositions.md). It supersedes the older persistent-Part meaning below for constructed Agents. Subjective memories retain their bias; temporary instances retain working continuity and remain in the inspector after retirement.

OntoAgentic explores a model in which a persistent Agent contains Identity and multiple persistent or temporary Parts. Parts represent specialized motivated perspectives. Identity is the persistent self-definition. Self is a temporary whole-agent perspective assembled when integration is needed.

The architecture separates wanting, predicting, warning, interpreting, advocating, choosing, and acting. These need not occur inside one monolithic inference.

```text
                    AGENT

          persistent internal state

       Identity           Parts
                           memory
                           strategies
                           predictions

             \             /
              \           /
               ▼         ▼

              cognition

                  │
         when integration needed
                  │
                  ▼

                 Self
          temporary whole-agent
             perspective

                  │
                  ▼

              Identity-
             informed choice

                  │
                  ▼

              Executive

                  │
                  ▼

                world
```

This diagram is conceptual, not a rigid object graph. Automatic behavior may reach action selection without a full Self episode.

The runtime order is flexible. Parts may be excessively cautious, trusting, frightened, impulsive, selfish, idealistic, cynical, childlike, analytical, emotionally intense, socially inappropriate, or narrowly obsessed. Balanced external behavior may emerge from interaction between biased perspectives; Parts need not each become moderate or globally aligned.

Identity need not duplicate exhaustive consequence prediction. Parts bring consequences, desires, dangers, opportunities, memories, and competing priorities to Identity's attention. The system is developmental: experience may change Parts, competence, beliefs, strategies, confidence, and relationships.
