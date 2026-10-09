# Perception Modes

The default constructed model is defined by [ADR 0126](../architecture/decisions/0126-constructed-perspectives-and-dispositions.md). It supersedes the older persistent-Part meaning below for constructed Agents. Subjective memories retain their bias; temporary instances retain working continuity and remain in the inspector after retirement.

The canonical runtime has one boundary: WorldState is provided to activated Parts, not directly to Self. Parts interpret WorldState and report through bids or answers to Self.

Experiments may vary how Parts receive or retrieve externally available facts, and how Self requests further mediated reports. Such variations must not grant Self raw WorldState access or permit Identity to become an external-world interpreter.
