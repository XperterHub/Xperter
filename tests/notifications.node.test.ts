import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnouncementItem,
  countUnreadAnnouncements,
  countUnreadNotifications,
  filterAnnouncements,
  filterNotifications,
  INITIAL_APP_ANNOUNCEMENTS,
  markAllNotificationsAsRead,
  markNotificationReadById,
  synthesizeWorkspaceNotifications,
} from "../src/lib/notifications";

test("filterAnnouncements filters by category and search query and keeps pinned first", () => {
  const all = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "all", "");
  assert.equal(all.length, 4);
  assert.equal(all[0]?.pinned, true);

  const features = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "feature", "");
  assert.equal(features.length, 2);
  assert.ok(features.every((a) => a.category === "feature"));

  const securitySearch = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "all", "Zero-Trust");
  assert.equal(securitySearch.length, 1);
  assert.equal(securitySearch[0]?.id, "ann_security_vault");
});

test("countUnreadAnnouncements tracks unread announcement IDs accurately", () => {
  const unreadInitial = countUnreadAnnouncements(INITIAL_APP_ANNOUNCEMENTS, [
    "ann_voice_polls",
    "ann_security_vault",
  ]);
  assert.equal(unreadInitial, 2);

  const unreadAllRead = countUnreadAnnouncements(
    INITIAL_APP_ANNOUNCEMENTS,
    INITIAL_APP_ANNOUNCEMENTS.map((a) => a.id),
  );
  assert.equal(unreadAllRead, 0);
});

test("buildAnnouncementItem normalizes and creates a new announcement", () => {
  const created = buildAnnouncementItem({
    title: "  Voice Rooms 3.0 Live  ",
    summary: "  Low-latency spatial audio channels are now available. ",
    category: "feature",
    version: "v3.0",
    author: "Nagaraj",
    pinned: true,
    nowMs: 1762000000000,
  });

  assert.equal(created.title, "Voice Rooms 3.0 Live");
  assert.equal(created.summary, "Low-latency spatial audio channels are now available.");
  assert.equal(created.category, "feature");
  assert.equal(created.version, "v3.0");
  assert.equal(created.pinned, true);
  assert.equal(created.acknowledgedCount, 1);
});

test("synthesizeWorkspaceNotifications combines unread chats, friend requests, and announcements", () => {
  const list = synthesizeWorkspaceNotifications({
    currentUserUid: "usr_me",
    contacts: [
      {
        id: "conv_1",
        name: "Aria Vance",
        unread: 3,
        lastMessageText: "Are we shipping the new glass inbox today?",
        lastMessageTime: "10:42 AM",
        updatedAtMs: 1761300000000,
      },
    ],
    friendRequests: [
      {
        id: "freq_1",
        fromUid: "usr_peer",
        fromLumenId: "LMN-8K2P9Q",
        fromName: "Devon Cross",
        toUid: "usr_me",
        toLumenId: "LMN-1A2B3C",
        toName: "Me",
        status: "pending",
        createdAtMs: 1761310000000,
      },
    ],
    announcements: INITIAL_APP_ANNOUNCEMENTS,
    readAnnouncementIds: ["ann_voice_polls", "ann_security_vault"],
    readNotificationIds: [],
    customNotifications: [],
  });

  assert.ok(list.length >= 4);
  assert.equal(filterNotifications(list, "requests").length, 1);
  assert.equal(filterNotifications(list, "announcements").length, 3);
  assert.ok(countUnreadNotifications(list) >= 3);

  const firstId = list[0]!.id;
  const afterSingleRead = markNotificationReadById(list, firstId);
  assert.equal(afterSingleRead.find((n) => n.id === firstId)?.read, true);

  const afterAllRead = markAllNotificationsAsRead(afterSingleRead);
  assert.equal(countUnreadNotifications(afterAllRead), 0);
});
