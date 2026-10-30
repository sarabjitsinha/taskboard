# Design Notes: Activity Feed Audit Logging

## Design Decision: Transaction Rollback on Activity Failure

**Chosen Approach:** Atomic Transaction (`transaction.atomic()`). If recording an activity audit log fails, the associated task or project mutation rolls back completely.

### Reasoning

1. **Audit Consistency as a First-Class Requirement:** In team collaboration and compliance-governed project management, the activity audit log is not optional telemetry—it is the source of truth for accountability and event history. Permitting task state changes to succeed when audit logging fails creates "phantom mutations" where state changes occur with zero record of who performed them or when.
2. **Preventing State-Log Desynchronization:** Decoupling the mutation from its log can result in irrecoverable drift between actual database state and the chronological history shown to team members. Wrapping both operations in `transaction.atomic()` guarantees that state transitions and audit records remain strictly synchronous and bidirectional.
3. **Database Guarantees:** Because the Activity model resides in the same PostgreSQL database as Tasks and Projects, atomic transactions introduce negligible latency overhead while eliminating complex dual-write inconsistency risks.

