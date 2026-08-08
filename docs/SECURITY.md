# Kestro — Security

## Data sensitivity

Kestro stores security incident data: descriptions of attacks/suspicious activity, IOCs, internal system details, and sometimes personal data (e.g., an implicated employee, a customer affected by a breach). Treat all case content as sensitive by default.

## Authentication

- **JWT-based**, issued and verified by the NestJS Auth module — no custom-rolled crypto.
- Password hashing via a standard, well-reviewed algorithm (a maintained bcrypt/argon2 implementation) — never a custom scheme.
- Token storage: prefer an httpOnly cookie for the JWT over `localStorage`/`sessionStorage`, which JavaScript (and therefore XSS) can read.
- Token lifetime and revocation are open considerations: JWTs are stateless by nature, so revoking a token before its expiry (e.g., on role change or account disable) needs a deliberate mechanism (short expiry + refresh, or a server-side denylist) — not yet decided, see docs/ROADMAP.md.
- SSO/external IdP integration remains deferred (see docs/ROADMAP.md) — Milestone 1 uses backend-native JWT auth.

## Authorization

- **Role-based**: Analyst and Lead (see docs/PRODUCT.md). All authorization checks happen server-side, on every request — the frontend hiding a button is UX only, not a security control.
- **Case visibility**:
  - An **Analyst** sees and can act on cases they are assigned to. They cannot list or fetch a case they are not assigned to.
  - A **Lead** can see and act on **all** cases, regardless of assignment.
  - This replaces an earlier draft assumption of "all analysts see all cases" — visibility is now scoped by role, matching the Lead-specific "access all cases" capability.
- **Lifecycle transitions**: enforced against the explicit state machine and role table in docs/WORKFLOW.md. Accepting an escalation and reopening a resolved case are Lead-only; all other forward transitions and escalating are available to both roles on cases they can access. No transition outside the documented table is accepted, regardless of role.
- **No client-trusted state**: the client never tells the server what the "current" case status is when requesting a transition — the server reads it from the database and validates the transition itself.

## Audit logging / timeline integrity

- Every state-changing action (alert dismissal/link, case creation, lifecycle transition, note/evidence added, comment) produces an immutable timeline event: who, what, when.
- **Append-only is enforced, not just conventional**: the application exposes no update or delete endpoint for timeline events, and the database role the application connects as should not hold `UPDATE`/`DELETE` grants on the `timeline_events` table, so a bug or a compromised app credential still cannot silently rewrite history. Any correction is itself a new, attributed entry.
- This log is a first-class product feature (see docs/WORKFLOW.md), not a side effect — it doubles as the audit trail.

## AI-specific risks (design constraint now, feature later)

AI is not implemented in Milestone 1, but the schema and module boundary are designed with it in mind (see docs/ARCHITECTURE.md), so these constraints apply from day one even while unused:

- **Data exfiltration via prompt context**: case data sent to an external AI provider leaves the system boundary. Before that module ships: minimize what's included in the prompt, disclose this in the product, confirm the provider's data retention/training terms, do not send data not needed for the specific suggestion.
- **Prompt injection**: alert/case content (attacker-controlled in origin — e.g., a filename, a note quoting phishing text) must never be interpreted as an instruction to the AI, and AI output must never be auto-executed or auto-applied to case state — always a suggestion requiring human acceptance.
- **Over-trust**: AI-authored content (including future AI-suggested hypotheses, see docs/PRODUCT.md) must be visually and structurally distinguishable from analyst-authored content and human-confirmed conclusions, permanently, so a post-resolution reviewer can tell what a human verified versus what a model suggested.

## Input handling

- **Strict input validation** at every backend endpoint (NestJS DTOs/validation pipes): types, lengths, and allowed enum values (e.g., evidence `type`, case lifecycle actions) validated server-side before touching the database or business logic — never inferred from what the frontend happens to send.
- **No binary uploads in Milestone 1.** Evidence is text-based only (type, source, content, timestamp, author — see docs/ROADMAP.md). This sidesteps the file-storage-hardening work (safe storage, forced-download, content-type locking) entirely until it's actually needed; that work must be designed properly before binary uploads are introduced in a later phase, not bolted on.
- Standard web risks apply and must be defended conventionally: parameterized queries only (via Prisma, never raw string-built SQL), output encoding for anything rendered from user content (case notes and evidence all become HTML-injection risk if rendered unescaped in the Next.js frontend), CSRF protection on state-changing requests.

## Operational boundaries

- **No secrets in logs**: application logs must never contain passwords, tokens, session identifiers, or full API keys. Log redaction is a requirement, not an afterthought, from the first logging statement written.
- **No production command execution**: the application has no feature, endpoint, or admin path that executes arbitrary shell/OS commands, in Milestone 1 or any planned phase. If a future integration seems to need this, it needs a separate security review before design, not an assumption it's fine.
- **No infrastructure write access**: the application holds no credentials for and makes no calls against Kubernetes, CI/CD, cloud provider APIs, or similar infrastructure control planes. Kestro is a business application that records investigations; it is not, and must not become, a tool that can change production infrastructure.
- **No unjustified infrastructure**: no microservices, Redis, Kafka, message brokers, event buses, Kubernetes, or infrastructure orchestration tooling in the initial product — see docs/ARCHITECTURE.md. Each of these expands the attack surface and operational complexity; none is added without a concrete requirement.

## Secrets

- Database credentials, and (in a later phase) AI provider API keys and any integration credentials, live in backend environment/secret configuration only — never in frontend code, never committed to the repository.

## Explicitly deferred (not designed yet — open decisions)

- SSO/enterprise identity integration
- Field-level encryption for especially sensitive case content
- Per-case access restriction finer than role + assignment (e.g., need-to-know beyond "is a Lead")
- Formal data retention policy (how long resolved cases are kept)
- Binary evidence upload storage hardening
