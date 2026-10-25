import { describe, expect, it } from "vitest";
import {
  decomposeTextIntoTodos,
  extractAlarmFromText,
  extractScheduleDays,
} from "@/components/task-page";

describe("task-page autoPlanner", () => {
  it("parses multi-task conversational input with typo correction and time normalization", () => {
    const tasks = decomposeTextIntoTodos(
      "do exercses at 7.30am and eat the snacls at 8pm , so atten the meeting at 6pn today",
    );

    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.text).toBe("Exercise");
    expect(tasks[0]?.alarmTime).toBe("7:30 AM");

    expect(tasks[1]?.text).toBe("Healthy Snack");
    expect(tasks[1]?.alarmTime).toBe("8:00 PM");

    expect(tasks[2]?.text).toBe("Meeting");
    expect(tasks[2]?.alarmTime).toBe("6:00 PM");
    expect(tasks[2]?.priority).toBe("high");
  });

  it("distinguishes recurring habits with day exceptions from standalone tasks", () => {
    const tasks = decomposeTextIntoTodos(
      "go to gym daily except weekends at 6pm and read books at 8pm",
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.text).toBe("GYM");
    expect(tasks[0]?.itemType).toBe("habit");
    expect(tasks[0]?.repeat).toBe("weekdays");
    expect(tasks[0]?.days).toEqual([1, 2, 3, 4, 5]);
    expect(tasks[0]?.alarmTime).toBe("6:00 PM");

    expect(tasks[1]?.text).toBe("Read Books");
    expect(tasks[1]?.itemType).toBe("task");
    expect(tasks[1]?.repeat).toBe("none");
    expect(tasks[1]?.alarmTime).toBe("8:00 PM");
  });

  it("extracts schedule days and alarms accurately", () => {
    const schedule = extractScheduleDays("daily except saturday and sunday");
    expect(schedule.repeat).toBe("weekdays");
    expect(schedule.days).toEqual([1, 2, 3, 4, 5]);

    const alarm = extractAlarmFromText("Meeting at 10:30 am", schedule.days);
    expect(alarm.alarmTime).toBe("10:30 AM");
    expect(typeof alarm.alarmTimestamp).toBe("number");
  });

  it("persists dark and light theme across anonymous session syncs", async () => {
    const { savePrefs, loadPrefs, syncPrefsForUserSession } = await import("@/lib/prefs");

    savePrefs({ theme: "dark", blur: 28, refract: false }, null);
    expect(loadPrefs(null).theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const syncedDark = syncPrefsForUserSession(null);
    expect(syncedDark.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    savePrefs({ theme: "light", blur: 28, refract: false }, null);
    const syncedLight = syncPrefsForUserSession(null);
    expect(syncedLight.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

