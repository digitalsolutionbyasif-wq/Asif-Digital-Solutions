# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny & PII Isolation**: Every root document defaults to deny (`allow read, write: if false`). User PII (`email`, `displayName`, `photoURL`) under `/users/{userId}` is readable and writable exclusively by the owning verified user (`request.auth.uid == userId && request.auth.token.email_verified == true`) or a verified admin.
2. **Master Gate Parent Existence**: Subcollections (`/users/{userId}/briefs/{briefId}`, `/users/{userId}/voiceSessions/{sessionId}`, `/users/{userId}/assets/{assetId}`) enforce parent existence (`exists(/databases/$(database)/documents/users/$(userId))`) and ownership (`ownerId == request.auth.uid && userId == request.auth.uid`) on creation.
3. **No Role Self-Escalation**: `UserProfile.role` on client writes MUST equal `'client'`. Admin checks rely solely on `/admins/{uid}` existence or verified bootstrapped admin emails (`digital.solution.by.asif@gmail.com`, `asifriaz1297@gmail.com` with `email_verified == true`).
4. **Immutable Ownership & Temporal Integrity**: `uid`, `ownerId`, and `createdAt` cannot change on update; `createdAt` on create and `updatedAt` on update MUST equal `request.time`.
5. **Terminal State Locking**: Once a `ClientProjectBrief` reaches `status == 'Archived'`, non-admin updates are blocked.
6. **Bounded Strings & Path Hardening**: Every document ID matches `^[a-zA-Z0-9_\\-]+$` with length `<= 128`, and every string field enforces explicit `minLength`/`maxLength` bounds matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write to `/users/uid_1` -> `PERMISSION_DENIED`.
2. Unverified email (`email_verified: false`) attempting `/users/uid_1` create -> `PERMISSION_DENIED`.
3. Cross-tenant access: `uid_2` reading or listing `/users/uid_1/briefs` -> `PERMISSION_DENIED`.
4. Role escalation shadow field: `UserProfile` create with `role: "admin"` -> `PERMISSION_DENIED`.
5. Ghost field injection: `ClientProjectBrief` create with extra `{ "isApproved": true }` -> `PERMISSION_DENIED`.
6. Owner spoofing: `uid_2` creating `/users/uid_2/briefs/b1` with `ownerId: "uid_1"` -> `PERMISSION_DENIED`.
7. Orphaned subcollection write: creating `/users/uid_1/briefs/b1` before `/users/uid_1` exists -> `PERMISSION_DENIED`.
8. Oversized ID poisoning: document ID length `> 128` or containing `$` / `.` -> `PERMISSION_DENIED`.
9. Resource exhaustion string: `aiSummary` exceeding `3000` characters -> `PERMISSION_DENIED`.
10. Client timestamp tampering: creating a brief with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
11. Terminal state bypass: non-admin updating `title` on an `Archived` brief -> `PERMISSION_DENIED`.
12. Value poisoning on update: changing `status` to `"AdminApproved"` outside enum allowlist -> `PERMISSION_DENIED`.
