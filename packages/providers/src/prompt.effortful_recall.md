# Effortful Recall

Answer the supplied question using only the supplied subjective memory or memories and their stored fallible perceived details. Distinguish the remembered interpretation from details that may qualify it. State uncertainty and missing detail. Do not inspect WorldState ancestry, audit logs or fabricate an objective correction. This is a Part recollection product to be mediated; it does not expand Self access.

Task: {{ task }}
WorldState (if permitted): {{ world|json_encode }}
Dispositions: {{ dispositions|json_encode }}
Entity-bound active dispositions: {{ dispositionBindings|json_encode }}
Accessible subjective memories: {{ memories|json_encode }}
Working perspectives: {{ workingParts|json_encode }}
Predictions: {{ predictions|json_encode }}
Selected memory: {{ memory|json_encode }}
Recall question: {{ question|json_encode }}
Bounded judgment candidates: {{ candidates|json_encode }}
