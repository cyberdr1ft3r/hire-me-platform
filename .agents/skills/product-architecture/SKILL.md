---
name: product-architecture
description: Define product scope, architecture, domain models, workflows, permissions, ADRs, and Mermaid diagrams for the Hire Me platform.
---

# Product Architecture Skill

Use this skill for product documentation and architecture decisions.

## Workflow

1. Read the issue, `AGENTS.md`, and all existing files under `docs/`.
2. Separate confirmed requirements from assumptions and future ideas.
3. Keep the design appropriate for a single-developer MVP while preserving clean module boundaries.
4. Use one consistent domain vocabulary across all documents and code.
5. Model workflows as explicit state machines, including exceptional and terminal states.
6. Document meaningful tradeoffs and unresolved decisions rather than hiding them.

## Required architecture principles

- Prefer a modular monolith over microservices for the initial product.
- Keep frontend, API, shared contracts, persistence, storage, jobs, and integrations clearly separated.
- Treat integrations as adapters behind interfaces.
- Treat permissions and auditability as cross-cutting concerns.
- Avoid speculative modules not supported by confirmed requirements.
- Design candidate history to survive movement across multiple recruitment missions.

## Domain-model checklist

For every entity define:

- Purpose and owner
- Important attributes
- Required and optional relationships
- Cardinality
- Lifecycle and archival behavior
- Sensitive fields
- Important uniqueness rules
- Audit requirements

## Mermaid rules

- Use GitHub-compatible Mermaid syntax.
- Prefer simple diagrams that render reliably.
- Keep entity names identical across diagrams and prose.
- Do not use unsupported styling or overly dense diagrams.
- Manually inspect syntax and relationships before completion.

## Output quality

- List assumptions explicitly.
- Include non-goals.
- Ensure product scope, architecture, workflows, permissions, and domain model do not contradict each other.
- Do not implement code when the issue is documentation-only.
