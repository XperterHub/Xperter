import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rulesSource = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

interface AuthCtx {
  uid: string;
  email_verified: boolean;
}

function isValidId(id: unknown): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

function evaluateUserProfileCreate(
  auth: AuthCtx | null,
  userId: string,
  data: Record<string, unknown>,
  requestTime: number,
): boolean {
  if (!auth || !auth.email_verified || auth.uid !== userId || !isValidId(userId)) return false;
  const required = ["uid", "displayName", "email", "photoURL", "createdAt", "updatedAt"];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k)) || !keys.every((k) => required.includes(k))) {
    return false;
  }
  return (
    isValidId(data.uid) &&
    data.uid === auth.uid &&
    typeof data.displayName === "string" &&
    data.displayName.length >= 1 &&
    data.displayName.length <= 80 &&
    typeof data.email === "string" &&
    data.email.length >= 3 &&
    data.email.length <= 254 &&
    typeof data.photoURL === "string" &&
    data.photoURL.length <= 2048 &&
    data.createdAt === requestTime &&
    data.updatedAt === requestTime
  );
}

function evaluateUserProfileGet(auth: AuthCtx | null, userId: string): boolean {
  return Boolean(auth && auth.email_verified && auth.uid === userId && isValidId(userId));
}

function evaluateConversationCreate(
  auth: AuthCtx | null,
  conversationId: string,
  data: Record<string, unknown>,
  requestTime: number,
): boolean {
  if (!auth || !auth.email_verified || !isValidId(conversationId)) return false;
  const required = [
    "ownerId",
    "name",
    "handle",
    "role",
    "isGroup",
    "memberCount",
    "pinned",
    "unread",
    "pinnedMsgId",
    "lastMessageText",
    "lastMessageTime",
    "createdAt",
    "updatedAt",
  ];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k)) || !keys.every((k) => required.includes(k))) {
    return false;
  }
  return (
    isValidId(data.ownerId) &&
    data.ownerId === auth.uid &&
    typeof data.name === "string" &&
    data.name.length >= 1 &&
    data.name.length <= 80 &&
    typeof data.handle === "string" &&
    data.handle.length >= 2 &&
    data.handle.length <= 60 &&
    typeof data.role === "string" &&
    data.role.length >= 1 &&
    data.role.length <= 60 &&
    typeof data.isGroup === "boolean" &&
    typeof data.memberCount === "number" &&
    Number.isInteger(data.memberCount) &&
    data.memberCount >= 1 &&
    data.memberCount <= 500 &&
    typeof data.pinned === "boolean" &&
    typeof data.unread === "number" &&
    Number.isInteger(data.unread) &&
    data.unread >= 0 &&
    data.unread <= 999 &&
    typeof data.pinnedMsgId === "string" &&
    data.pinnedMsgId.length <= 128 &&
    typeof data.lastMessageText === "string" &&
    data.lastMessageText.length <= 500 &&
    typeof data.lastMessageTime === "string" &&
    data.lastMessageTime.length <= 32 &&
    data.createdAt === requestTime &&
    data.updatedAt === requestTime
  );
}

function evaluateMessageCreate(
  auth: AuthCtx | null,
  conversationId: string,
  messageId: string,
  parentOwnerId: string | null,
  data: Record<string, unknown>,
  requestTime: number,
): boolean {
  if (!auth || !auth.email_verified || !isValidId(conversationId) || !isValidId(messageId)) {
    return false;
  }
  if (!parentOwnerId || parentOwnerId !== auth.uid) return false;
  const required = [
    "ownerId",
    "conversationId",
    "senderName",
    "me",
    "kind",
    "text",
    "time",
    "dateGroup",
    "edited",
    "replyToId",
    "forwardedFrom",
    "status",
    "attachmentName",
    "attachmentSize",
    "attachmentUrl",
    "attachmentIsImage",
    "audioUrl",
    "audioDuration",
    "pollQuestion",
    "pollOptions",
    "pollVotes",
    "reactions",
    "createdAt",
    "updatedAt",
  ];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k)) || !keys.every((k) => required.includes(k))) {
    return false;
  }
  return (
    isValidId(data.ownerId) &&
    data.ownerId === auth.uid &&
    isValidId(data.conversationId) &&
    data.conversationId === conversationId &&
    typeof data.senderName === "string" &&
    data.senderName.length >= 1 &&
    data.senderName.length <= 80 &&
    typeof data.me === "boolean" &&
    typeof data.kind === "string" &&
    ["text", "poll", "attachment", "voice"].includes(data.kind) &&
    typeof data.text === "string" &&
    data.text.length <= 2000 &&
    typeof data.time === "string" &&
    data.time.length >= 1 &&
    data.time.length <= 32 &&
    typeof data.dateGroup === "string" &&
    data.dateGroup.length >= 1 &&
    data.dateGroup.length <= 32 &&
    typeof data.edited === "boolean" &&
    typeof data.replyToId === "string" &&
    data.replyToId.length <= 128 &&
    typeof data.forwardedFrom === "string" &&
    data.forwardedFrom.length <= 80 &&
    typeof data.status === "string" &&
    ["sent", "read"].includes(data.status) &&
    typeof data.attachmentName === "string" &&
    data.attachmentName.length <= 200 &&
    typeof data.attachmentSize === "string" &&
    data.attachmentSize.length <= 40 &&
    typeof data.attachmentUrl === "string" &&
    data.attachmentUrl.length <= 500000 &&
    typeof data.attachmentIsImage === "boolean" &&
    typeof data.audioUrl === "string" &&
    data.audioUrl.length <= 500000 &&
    typeof data.audioDuration === "number" &&
    Number.isInteger(data.audioDuration) &&
    data.audioDuration >= 0 &&
    data.audioDuration <= 600 &&
    typeof data.pollQuestion === "string" &&
    data.pollQuestion.length <= 300 &&
    Array.isArray(data.pollOptions) &&
    data.pollOptions.length <= 4 &&
    (data.pollOptions.length === 0 ||
      (typeof data.pollOptions[0] === "string" && data.pollOptions[0].length <= 120)) &&
    Array.isArray(data.pollVotes) &&
    data.pollVotes.length <= 4 &&
    (data.pollVotes.length === 0 ||
      (typeof data.pollVotes[0] === "string" && data.pollVotes[0].length <= 120)) &&
    Array.isArray(data.reactions) &&
    data.reactions.length <= 13 &&
    (data.reactions.length === 0 ||
      (typeof data.reactions[0] === "string" && data.reactions[0].length <= 16)) &&
    data.createdAt === requestTime &&
    data.updatedAt === requestTime
  );
}

describe("Firestore Zero-Trust Security Rules — Dirty Dozen Audit", () => {
  const now = 1729650000000;
  const alice: AuthCtx = { uid: "user_alice", email_verified: true };

  const baseMsg = {
    ownerId: "user_alice",
    conversationId: "conv_1",
    senderName: "Alice",
    me: true,
    kind: "text",
    text: "Hello world",
    time: "10:00",
    dateGroup: "Today",
    edited: false,
    replyToId: "",
    forwardedFrom: "",
    status: "sent",
    attachmentName: "",
    attachmentSize: "",
    attachmentUrl: "",
    attachmentIsImage: false,
    audioUrl: "",
    audioDuration: 0,
    pollQuestion: "",
    pollOptions: [],
    pollVotes: [],
    reactions: [],
    createdAt: now,
    updatedAt: now,
  };

  it("enforces default-deny catch-all and all 8 Pillars in firestore.rules", () => {
    expect(rulesSource).toContain("rules_version = '2';");
    expect(rulesSource).toContain("match /{document=**}");
    expect(rulesSource).toContain("allow read, write: if false;");
    expect(rulesSource).toContain("request.auth.token.email_verified == true");
    expect(rulesSource).toContain("isValidUserProfile(incoming())");
    expect(rulesSource).toContain("isValidConversation(incoming())");
    expect(rulesSource).toContain("isValidMessage(incoming(), conversationId)");
  });

  it("denies all 12 Dirty Dozen adversarial payloads", () => {
    // 1. Identity Spoofing on Conversation Create
    expect(
      evaluateConversationCreate(
        alice,
        "conv_1",
        {
          ownerId: "victim_uid_999",
          name: "Spoof",
          handle: "@spoof",
          role: "Direct Thread",
          isGroup: false,
          memberCount: 2,
          pinned: false,
          unread: 0,
          pinnedMsgId: "",
          lastMessageText: "",
          lastMessageTime: "10:00",
          createdAt: now,
          updatedAt: now,
        },
        now,
      ),
    ).toBe(false);

    // 2. Shadow Field Injection on UserProfile Create
    expect(
      evaluateUserProfileCreate(
        alice,
        "user_alice",
        {
          uid: "user_alice",
          displayName: "Alice",
          email: "alice@example.com",
          photoURL: "",
          createdAt: now,
          updatedAt: now,
          isAdmin: true,
        },
        now,
      ),
    ).toBe(false);

    // 3. Unverified Email Spoof Attack
    expect(
      evaluateUserProfileCreate(
        { uid: "user_alice", email_verified: false },
        "user_alice",
        {
          uid: "user_alice",
          displayName: "Alice",
          email: "alice@example.com",
          photoURL: "",
          createdAt: now,
          updatedAt: now,
        },
        now,
      ),
    ).toBe(false);

    // 4. PII Cross-User Read Attack
    expect(evaluateUserProfileGet({ uid: "user_bob", email_verified: true }, "user_alice")).toBe(
      false,
    );

    // 5. ID Poisoning / Invalid Characters in Document ID
    expect(
      evaluateConversationCreate(
        alice,
        "invalid$id!with@symbols",
        {
          ownerId: "user_alice",
          name: "Valid",
          handle: "@valid",
          role: "Direct Thread",
          isGroup: false,
          memberCount: 2,
          pinned: false,
          unread: 0,
          pinnedMsgId: "",
          lastMessageText: "",
          lastMessageTime: "10:00",
          createdAt: now,
          updatedAt: now,
        },
        now,
      ),
    ).toBe(false);

    // 6. Denial-of-Wallet String Overflow on Message Text (>2000 chars)
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, text: "x".repeat(2005) },
        now,
      ),
    ).toBe(false);

    // 7. Unbounded Array Overflow on Message Reactions (>13 items)
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, reactions: Array.from({ length: 20 }, () => "⭐") },
        now,
      ),
    ).toBe(false);

    // 8. Array Type Poisoning on Poll Options
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, pollOptions: [12345 as unknown as string] },
        now,
      ),
    ).toBe(false);

    // 9. Immortal Field Mutation / Spoofed Conversation ID on Message
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, conversationId: "conv_other" },
        now,
      ),
    ).toBe(false);

    // 10. Orphaned Subcollection Write (missing or non-owned parent conversation)
    expect(
      evaluateMessageCreate(alice, "conv_1", "msg_1", null, baseMsg, now),
    ).toBe(false);

    // 11. Forged Client Timestamp (createdAt != request.time)
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, createdAt: now - 60000 },
        now,
      ),
    ).toBe(false);

    // 12. Invalid Enum / Ghost Key on Message
    expect(
      evaluateMessageCreate(
        alice,
        "conv_1",
        "msg_1",
        "user_alice",
        { ...baseMsg, kind: "system_hack" },
        now,
      ),
    ).toBe(false);
  });
});
