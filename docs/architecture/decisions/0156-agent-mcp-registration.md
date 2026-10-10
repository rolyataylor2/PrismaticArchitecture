# ADR 0156: Agent MCP membership and reviewed registration

Status: Accepted.
Date: 2026-10-09
Source: Researcher request for an Agent MCP list and guided manual/public-repository registration.

MCP transport definitions remain shared external configuration. Each Agent may retain explicit server membership alongside its independently granted tools. Membership permits listing and researcher discovery, never tool execution. Legacy tool grants imply membership. Removing membership revokes that Agent's corresponding tools without deleting another Agent's shared connection. Shared registry removal revokes memberships and grants with preserved configuration history.

The researcher registers and associates a new connection atomically under optimistic registry and permission revisions, or associates an existing registered connection. Registration does not start a process, grant tools, enable Executive integration or invoke cognition.

A guided dialog offers official MCP Registry search as the primary import method, manual settings, public GitHub repository import, and reuse of an existing registered connection. Repository import performs bounded read-only retrieval of declared configuration; it does not clone, install or execute repository code. Supported connection declarations are reviewed and editable before separate explicit registration. Credential environment values are replaced with references. Unsupported declarations report limitations rather than becoming guessed execution plans. No inference task, psychological authority or Self access changes.

Verification covers Agent isolation, atomic stale-write rejection, membership persistence/revocation, bounded repository parsing and browser manual/import/cancellation paths. These are deterministic infrastructure checks, not psychological hypotheses.

The official MCP Registry (https://registry.modelcontextprotocol.io/) is the primary public import source. Its versioned metadata proposes supported connection settings, reviewed before registration. GitHub repository declarations remain a fallback. Catalog publication does not confer Agent tool grants or execution authority.
