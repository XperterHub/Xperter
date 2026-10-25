# Firestore Zero-Trust Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: All paths not explicitly matched (`/{document=**}`) deny all reads and writes (`allow read, write: if false`).
2. **Verified Authentication**: Every read and write requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **PII Isolation (`/users/{userId}`)**:
   - Only the owner (`request.auth.uid == userId`) can `get`, `create`, or `update` `/users/{userId}`.
   - Listing `/users` (`allow list`) is strictly forbidden (`false`) to prevent PII scraping.
   - `uid` and `createdAt` are immutable after creation; `updatedAt` must equal `request.time`.
4. **Conversation Ownership (`/conversations/{conversationId}`)**:
   - `ownerId` must equal `request.auth.uid` on creation and is immutable during updates.
   - `allow list` enforces `resource.data.ownerId == request.auth.uid` without any `get()` or `exists()` calls.
   - `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time`.
5. **Relational Master Gate (`/conversations/{conversationId}/messages/{messageId}`)**:
   - Single-document operations (`get`, `create`, `update`, `delete`) validate `isValidId(conversationId) && isValidId(messageId)` and verify parent ownership via `get(/databases/$(database)/documents/conversations/$(conversationId)).data.ownerId == request.auth.uid`.
   - `allow list` enforces `resource.data.ownerId == request.auth.uid` directly without `get()` lookups.
   - `ownerId`, `conversationId`, and `createdAt` are immutable across updates.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on Conversation Create)**:
   ```json
   { "ownerId": "victim_uid_999", "name": "Spoof", "handle": "@spoof", "role": "Direct Thread", "isGroup": false, "memberCount": 2, "pinned": false, "unread": 0, "pinnedMsgId": "", "lastMessageText": "", "lastMessageTime": "10:00" }
   ```
2. **Payload 2 (Shadow Field Injection on User Profile Create)**:
   ```json
   { "uid": "user_1", "displayName": "Alice", "email": "alice@example.com", "photoURL": "", "isAdmin": true }
   ```
3. **Payload 3 (Unverified Email Spoof Attack)**:
   Auth token with `email_verified: false` attempting to create `/users/user_1`.
4. **Payload 4 (PII Cross-User Read Attack)**:
   Authenticated `user_2` attempting `get(/users/user_1)`.
5. **Payload 5 (ID Poisoning / Oversized Document ID)**:
   Path `/conversations/invalid$id!with@symbols` or >128 chars.
6. **Payload 6 (Denial-of-Wallet String Overflow on Message Text)**:
   Message `text` length > 2000 characters.
7. **Payload 7 (Unbounded Array Overflow on Message Reactions)**:
   Message `reactions` array containing 25 items (exceeding max 13).
8. **Payload 8 (Array Type Poisoning on Poll Options)**:
   Message `pollOptions` containing `[12345, true]` instead of strings.
9. **Payload 9 (Immortal Field Mutation on Conversation Update)**:
   Updating `ownerId` or `createdAt` on an existing `/conversations/{id}` document.
10. **Payload 10 (Orphaned Subcollection Write)**:
    Creating `/conversations/non_existent_conv/messages/msg_1` where parent conversation does not exist or belongs to another user.
11. **Payload 11 (Forged Client Timestamp)**:
    Creating a conversation with `createdAt` set to a past/future timestamp instead of `request.time`.
12. **Payload 12 (Unauthorized Update Action / Unlisted Key Mutation)**:
    Updating `senderName` or `kind` on an existing message outside allowed action keys (`text`, `edited`, `reactions`, `pollVotes`, `status`, `updatedAt`).

---

## 3. Security Rules Test Specification (`firestore.rules.test.ts`)

All 12 adversarial payloads are tested against the security rules logic to guarantee `PERMISSION_DENIED`.
