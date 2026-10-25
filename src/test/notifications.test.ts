import { describe, it, expect } from "vitest";
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
} from "../lib/notifications";

describe("notifications and announcements logic", () => {
  it("filterAnnouncements filters by category and search query and keeps pinned first", () => {
    const all = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "all", "");
    expect(all.length).toBe(4);
    expect(all[0]?.pinned).toBe(true);

    const features = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "feature", "");
    expect(features.length).toBe(2);
    expect(features.every((a) => a.category === "feature")).toBe(true);

    const securitySearch = filterAnnouncements(INITIAL_APP_ANNOUNCEMENTS, "all", "Zero-Trust");
    expect(securitySearch.length).toBe(1);
    expect(securitySearch[0]?.id).toBe("ann_security_vault");
  });

  it("countUnreadAnnouncements tracks unread announcement IDs accurately", () => {
    const unreadInitial = countUnreadAnnouncements(INITIAL_APP_ANNOUNCEMENTS, [
      "ann_voice_polls",
      "ann_security_vault",
    ]);
    expect(unreadInitial).toBe(2);

    const unreadAllRead = countUnreadAnnouncements(
      INITIAL_APP_ANNOUNCEMENTS,
      INITIAL_APP_ANNOUNCEMENTS.map((a) => a.id),
    );
    expect(unreadAllRead).toBe(0);
  });

  it("buildAnnouncementItem normalizes and creates a new announcement", () => {
    const created = buildAnnouncementItem({
      title: "  Voice Rooms 3.0 Live  ",
      summary: "  Low-latency spatial audio channels are now available. ",
      category: "feature",
      version: "v3.0",
      author: "Nagaraj",
      pinned: true,
      nowMs: 1762000000000,
    });

    expect(created.title).toBe("Voice Rooms 3.0 Live");
    expect(created.summary).toBe("Low-latency spatial audio channels are now available.");
    expect(created.category).toBe("feature");
    expect(created.version).toBe("v3.0");
    expect(created.pinned).toBe(true);
    expect(created.acknowledgedCount).toBe(1);
  });

  it("synthesizeWorkspaceNotifications combines unread chats, friend requests, and announcements", () => {
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

    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(filterNotifications(list, "requests").length).toBe(1);
    expect(filterNotifications(list, "announcements").length).toBe(3);
    expect(countUnreadNotifications(list)).toBeGreaterThanOrEqual(3);

    const firstId = list[0]!.id;
    const afterSingleRead = markNotificationReadById(list, firstId);
    expect(afterSingleRead.find((n) => n.id === firstId)?.read).toBe(true);

    const afterAllRead = markAllNotificationsAsRead(afterSingleRead);
    expect(countUnreadNotifications(afterAllRead)).toBe(0);
  });
});
