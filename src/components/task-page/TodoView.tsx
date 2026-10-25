import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Plus,
  Check,
  Trash2,
  Filter,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  Bell,
  BellOff,
  X,
  Edit3,
  ChevronDown,
  SlidersHorizontal,
  Volume2,
  Play,
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  playSettingsLiquidSound,
  triggerSettingsHaptic,
} from "@/components/SettingsControl";
import {
  decomposeTextIntoTodos,
  extractAlarmFromText,
  extractScheduleDays,
  loadSavedTodos,
  saveTodos,
  DAY_NAMES,
  type TodoItem,
  type PriorityLevel,
} from "./autoPlanner";
import {
  loadTaskSettings,
  saveTaskSettings,
  playAlarmSound,
  type TaskSettings,
  type RingtoneType,
} from "./alarmAudio";
import { toast } from "sonner";

export function TodoView() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [rawPlanText, setRawPlanText] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [filter, setFilter] = useState<"all" | "habits" | "tasks" | "completed">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>("all");
  const [sortBy, setSortBy] = useState<"newest" | "priority" | "alpha">("newest");

  // Single task quick add
  const [quickText, setQuickText] = useState("");
  const [quickPriority, setQuickPriority] = useState<PriorityLevel>("medium");

  // Auto-plan review popup modal
  const [planReviewOpen, setPlanReviewOpen] = useState(false);
  const [stagedTodos, setStagedTodos] = useState<TodoItem[]>([]);

  // Task edit popup
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [editPopupOpen, setEditPopupOpen] = useState(false);

  // Clear completed confirm popup
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Task settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskSettings, setTaskSettings] = useState<TaskSettings>(loadTaskSettings);

  // Initial load
  useEffect(() => {
    setTodos(loadSavedTodos());
  }, []);

  const updateTodosState = (updater: (prev: TodoItem[]) => TodoItem[]) => {
    setTodos((prev) => {
      const next = updater(prev);
      saveTodos(next);
      return next;
    });
  };

  const handleUpdateSettings = <K extends keyof TaskSettings>(key: K, value: TaskSettings[K]) => {
    setTaskSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveTaskSettings(next);
      return next;
    });
  };

  const handlePopupSound = (opening: boolean) => {
    if (taskSettings.haptics) triggerSettingsHaptic(opening);
    playSettingsLiquidSound(opening);
  };

  // Real-time alarm checker respecting active days
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();
      const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

      todos.forEach((item) => {
        if (item.days && item.days.length > 0 && !item.days.includes(currentDay)) {
          return; // Excluded day (e.g. Saturday or Sunday)
        }

        if (
          item.alarmTimestamp &&
          item.alarmTimestamp <= nowMs &&
          item.alarmEnabled &&
          !item.alarmFired &&
          !item.completed
        ) {
          playAlarmSound(taskSettings.ringtone, taskSettings.volume);
          if (taskSettings.haptics) triggerSettingsHaptic(true);

          toast(`Alarm: ${item.text}`, {
            description: item.alarmTime ? `Scheduled at ${item.alarmTime}` : undefined,
            duration: 9000,
            action: {
              label: "Snooze 5m",
              onClick: () => {
                const snoozedMs = Date.now() + 5 * 60 * 1000;
                const d = new Date(snoozedMs);
                const h12 = d.getHours() % 12 || 12;
                const ampm = d.getHours() >= 12 ? "PM" : "AM";
                const fmt = `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
                updateTodosState((prev) =>
                  prev.map((t) =>
                    t.id === item.id
                      ? {
                          ...t,
                          alarmTimestamp: snoozedMs,
                          alarmTime: fmt,
                          alarmFired: false,
                          alarmEnabled: true,
                        }
                      : t
                  )
                );
                toast.success(`Alarm snoozed until ${fmt}`);
              },
            },
          });

          // Mark alarm as fired
          updateTodosState((prev) =>
            prev.map((t) => (t.id === item.id ? { ...t, alarmFired: true } : t))
          );
        }
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [todos, taskSettings]);

  // Toggle task complete
  const handleToggle = (id: string) => {
    updateTodosState((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextCompleted = !item.completed;
          handlePopupSound(nextCompleted);
          return {
            ...item,
            completed: nextCompleted,
            completedAt: nextCompleted ? Date.now() : undefined,
          };
        }
        return item;
      })
    );
  };

  // Toggle alarm for single task
  const handleToggleAlarm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handlePopupSound(true);
    updateTodosState((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextEnabled = !item.alarmEnabled;
          if (nextEnabled && !item.alarmTimestamp) {
            const targetMs = Date.now() + 30 * 60 * 1000;
            const d = new Date(targetMs);
            const h12 = d.getHours() % 12 || 12;
            const ampm = d.getHours() >= 12 ? "PM" : "AM";
            const fmt = `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
            return {
              ...item,
              alarmEnabled: true,
              alarmFired: false,
              alarmTimestamp: targetMs,
              alarmTime: fmt,
            };
          }
          return {
            ...item,
            alarmEnabled: nextEnabled,
            alarmFired: false,
          };
        }
        return item;
      })
    );
  };

  // Toggle specific day for recurring task
  const handleToggleDay = (taskId: string, dayIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    handlePopupSound(true);
    updateTodosState((prev) =>
      prev.map((item) => {
        if (item.id === taskId) {
          const currentDays = item.days || [0, 1, 2, 3, 4, 5, 6];
          const hasDay = currentDays.includes(dayIndex);
          const nextDays = hasDay
            ? currentDays.filter((d) => d !== dayIndex)
            : [...currentDays, dayIndex].sort();

          return {
            ...item,
            days: nextDays,
            repeat: nextDays.length === 5 && !nextDays.includes(0) && !nextDays.includes(6)
              ? "weekdays"
              : nextDays.length === 7
              ? "daily"
              : "custom",
          };
        }
        return item;
      })
    );
  };

  // Delete task
  const handleDelete = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handlePopupSound(false);
    updateTodosState((prev) => prev.filter((t) => t.id !== id));
    toast.success("Task deleted");
  };

  // Quick manual add
  const handleQuickAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = quickText.trim();
    if (!text) return;

    const schedule = extractScheduleDays(text);
    const alarmResult = extractAlarmFromText(schedule.cleanText, schedule.days);

    const isHabit = schedule.repeat !== "none";
    const newItem: TodoItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: alarmResult.cleanText,
      completed: false,
      priority: quickPriority,
      tag: "task",
      itemType: isHabit ? "habit" : "task",
      estimatedTime: "20m",
      alarmTime: alarmResult.alarmTime,
      alarmTimestamp: alarmResult.alarmTimestamp,
      alarmEnabled: Boolean(alarmResult.alarmTimestamp),
      alarmFired: false,
      repeat: schedule.repeat,
      days: isHabit ? schedule.days : undefined,
      createdAt: Date.now(),
    };

    handlePopupSound(true);
    updateTodosState((prev) => [newItem, ...prev]);
    setQuickText("");
    if (alarmResult.alarmTime) {
      toast.success(`Task scheduled with alarm at ${alarmResult.alarmTime}`);
    } else {
      toast.success("Task added");
    }
  };

  // Trigger auto planner
  const handleRunAutoPlan = () => {
    if (!rawPlanText.trim()) return;

    setIsPlanning(true);
    handlePopupSound(true);

    setTimeout(() => {
      const parsed = decomposeTextIntoTodos(rawPlanText);
      setIsPlanning(false);

      if (parsed.length === 0) {
        toast.error("Could not parse task");
        return;
      }

      setStagedTodos(parsed);
      setPlanReviewOpen(true);
      handlePopupSound(true);
    }, 280);
  };

  // Apply staged plan
  const handleAcceptPlan = (mode: "append" | "replace") => {
    handlePopupSound(true);
    if (mode === "replace") {
      updateTodosState(() => stagedTodos);
      toast.success(`Scheduled ${stagedTodos.length} tasks`);
    } else {
      updateTodosState((prev) => [...stagedTodos, ...prev]);
      toast.success(`Added ${stagedTodos.length} tasks`);
    }
    setPlanReviewOpen(false);
    setRawPlanText("");
  };

  // Clear completed
  const handleClearCompleted = () => {
    handlePopupSound(false);
    updateTodosState((prev) => prev.filter((t) => !t.completed));
    setClearConfirmOpen(false);
    toast.success("Cleared completed tasks");
  };

  // Save edit popup
  const handleSaveEdit = () => {
    if (!editingTodo) return;
    updateTodosState((prev) =>
      prev.map((t) => (t.id === editingTodo.id ? editingTodo : t))
    );
    handlePopupSound(false);
    setEditPopupOpen(false);
    toast.success("Task updated");
  };

  // Stats calculation
  const totalCount = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;
  const habitsCount = todos.filter((t) => (t.itemType === "habit" || (t.repeat && t.repeat !== "none")) && !t.completed).length;
  const tasksCount = todos.filter((t) => (t.itemType !== "habit" && (!t.repeat || t.repeat === "none")) && !t.completed).length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  // Filtered & sorted list
  const visibleTodos = useMemo(() => {
    let result = todos.filter((t) => {
      if (filter === "habits") return (t.itemType === "habit" || (t.repeat && t.repeat !== "none")) && !t.completed;
      if (filter === "tasks") return t.itemType !== "habit" && (!t.repeat || t.repeat === "none") && !t.completed;
      if (filter === "completed") return t.completed;
      return true;
    });

    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "priority") {
        const score = (p: PriorityLevel) => (p === "high" ? 3 : p === "medium" ? 2 : 1);
        return score(b.priority) - score(a.priority);
      }
      if (sortBy === "alpha") {
        return a.text.localeCompare(b.text);
      }
      return b.createdAt - a.createdAt;
    });

    return result;
  }, [todos, filter, priorityFilter, sortBy]);

  return (
    <div className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-4xl">
        {/* Sleek, Theme-Harmonious Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="pl-14 sm:pl-16">
            <h1 className="bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl md:text-4xl">
              Task Matrix
            </h1>
          </div>

          {/* Integrated Glass Progress & Task Settings Bar */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* Progress Pill */}
            <div className="glass flex h-10 items-center gap-3 rounded-full border border-border/40 px-3.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-foreground">
                <span>{completedCount}/{totalCount}</span>
                <span className="text-[11px] font-normal text-muted-foreground">done</span>
              </div>

              {/* Glowing Metallic Progress Bar */}
              <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-foreground/10 sm:w-28">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-emerald-400 shadow-[0_0_8px_rgba(56,189,248,0.5)] transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {progressPercent}%
              </span>
            </div>

            {/* Compact Task Settings Popover Trigger */}
            <Popover
              open={settingsOpen}
              onOpenChange={(open) => {
                handlePopupSound(open);
                setSettingsOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="settings-trigger-btn glass h-10 w-10 rounded-full border border-border/40 text-foreground/80 hover:text-foreground"
                  title="Task & Alarm Settings"
                  aria-label="Task Settings"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                sideOffset={8}
                className="settings-popover glass z-[90] w-72 rounded-[1.5rem] p-4 text-foreground shadow-2xl"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <h3 className="text-xs font-semibold text-foreground">Task Settings</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      handlePopupSound(false);
                      setSettingsOpen(false);
                    }}
                    className="settings-trigger-btn h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Compact Settings Controls with Reduced Distance */}
                <div className="mt-2.5 space-y-3">
                  {/* Compact Ringtone Dropdown */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Alarm Ringtone</label>
                    <div className="flex items-center gap-2">
                      <DropdownMenu onOpenChange={(open) => handlePopupSound(open)}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="settings-trigger-btn glass flex-1 justify-between rounded-xl border border-border/60 px-3 text-xs font-semibold text-foreground hover:bg-glass-strong"
                          >
                            <span className="capitalize">{taskSettings.ringtone}</span>
                            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          sideOffset={6}
                          className="settings-popover glass z-[100] w-44 rounded-2xl p-1.5"
                        >
                          {(["chime", "beep", "zen", "radar"] as RingtoneType[]).map((r) => (
                            <DropdownMenuItem
                              key={r}
                              onClick={() => {
                                handleUpdateSettings("ringtone", r);
                                playAlarmSound(r, taskSettings.volume);
                              }}
                              className="settings-trigger-btn flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium capitalize"
                            >
                              <span>{r}</span>
                              {taskSettings.ringtone === r && (
                                <Check className="h-3.5 w-3.5 text-primary stroke-[2.5]" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Sound Preview Play Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => playAlarmSound(taskSettings.ringtone, taskSettings.volume)}
                        className="settings-trigger-btn glass h-8 w-8 shrink-0 rounded-xl border border-border/60 text-foreground hover:text-primary"
                        title="Preview ringtone sound"
                        aria-label="Preview ringtone"
                      >
                        <Play className="h-3 w-3 fill-current" />
                      </Button>
                    </div>
                  </div>

                  {/* Volume Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Volume2 className="h-3 w-3" />
                        Volume
                      </span>
                      <span className="tabular-nums font-semibold">{Math.round(taskSettings.volume * 100)}%</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={[taskSettings.volume]}
                      onValueChange={([v]) => v && handleUpdateSettings("volume", v)}
                      className="mt-1"
                    />
                  </div>

                  {/* Haptics */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs font-medium">Haptic Feedback</span>
                    <Switch
                      checked={taskSettings.haptics}
                      onCheckedChange={(checked) => handleUpdateSettings("haptics", checked)}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Natural Language Task Input Box */}
        <GlassCard
          variant="default"
          padding="md"
          className="relative mt-5 overflow-hidden border border-border/50 shadow-xl"
        >
          <div className="relative">
            <Textarea
              value={rawPlanText}
              onChange={(e) => setRawPlanText(e.target.value)}
              placeholder="e.g. Do yoga at morning6am, or I want to go to the gym daily but except saturday and sunday..."
              className="glass glass-scroll min-h-[76px] w-full resize-none rounded-2xl border-border/40 p-3.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/50"
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {rawPlanText.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRawPlanText("")}
                className="settings-trigger-btn h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            ) : (
              <div />
            )}

            {/* High-Contrast, Sharp-Text Auto Plan Button */}
            <Button
              type="button"
              onClick={handleRunAutoPlan}
              disabled={isPlanning || !rawPlanText.trim()}
              className="btn-ink settings-trigger-btn relative inline-flex h-9 items-center gap-2 rounded-full border border-foreground/15 px-4 text-xs font-bold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-300 dark:text-cyan-600" />
              <span className="font-bold">
                {isPlanning ? "Planning..." : "Auto Plan"}
              </span>
            </Button>
          </div>
        </GlassCard>

        {/* Quick Add Bar & Filter Controls */}
        <div className="mt-5 flex flex-col gap-3">
          {/* Quick Add Form */}
          <form
            onSubmit={handleQuickAdd}
            className="glass flex items-center gap-2 rounded-2xl border border-border/70 p-1.5"
          >
            <Input
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Add task directly (e.g. Meeting at 4pm)..."
              className="h-9 border-none bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />

            {/* Quick Priority Selector */}
            <DropdownMenu onOpenChange={(open) => handlePopupSound(open)}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="settings-trigger-btn h-8 gap-1.5 rounded-xl border border-border/50 bg-foreground/5 px-2.5 text-xs font-semibold text-foreground hover:bg-foreground/10"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      quickPriority === "high"
                        ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]"
                        : quickPriority === "medium"
                        ? "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                        : "bg-slate-400"
                    }`}
                  />
                  <span className="capitalize">{quickPriority}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="settings-popover glass z-[80] w-36 rounded-2xl p-1.5"
              >
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                  Priority
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setQuickPriority("high")}
                  className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300"
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span>High</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setQuickPriority("medium")}
                  className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-300"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>Medium</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setQuickPriority("low")}
                  className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <span>Low</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="submit"
              size="sm"
              disabled={!quickText.trim()}
              className="btn-ink settings-trigger-btn h-8 w-8 shrink-0 rounded-xl p-0 text-primary-foreground disabled:opacity-50"
              aria-label="Add task"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          {/* Filter, Sort & Bulk Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Filter Tabs */}
            <div className="glass flex items-center gap-1 rounded-full border border-border/60 p-1">
              {(["all", "habits", "tasks", "completed"] as const).map((tab) => {
                const count =
                  tab === "all"
                    ? totalCount
                    : tab === "habits"
                    ? habitsCount
                    : tab === "tasks"
                    ? tasksCount
                    : completedCount;
                const active = filter === tab;
                const label =
                  tab === "all" ? "All" : tab === "habits" ? "Habits" : tab === "tasks" ? "Tasks" : "Completed";
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      handlePopupSound(true);
                      setFilter(tab);
                    }}
                    className={`settings-trigger-btn rounded-full px-3 py-1 text-xs font-semibold capitalize transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
                    }`}
                  >
                    {label} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Dropdown Filters (Priority & Sort) */}
            <div className="flex items-center gap-2">
              <DropdownMenu onOpenChange={(open) => handlePopupSound(open)}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="glass settings-trigger-btn h-8 gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-foreground/85 hover:text-foreground"
                  >
                    <Filter className="h-3 w-3" />
                    <span>
                      {priorityFilter === "all" ? "All Priorities" : `${priorityFilter} only`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="settings-popover glass z-[80] w-40 rounded-2xl p-1.5"
                >
                  <DropdownMenuItem
                    onClick={() => setPriorityFilter("all")}
                    className="settings-trigger-btn rounded-xl text-xs"
                  >
                    All Priorities
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPriorityFilter("high")}
                    className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300"
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    High
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPriorityFilter("medium")}
                    className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-300"
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setPriorityFilter("low")}
                    className="settings-trigger-btn flex items-center gap-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Low
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu onOpenChange={(open) => handlePopupSound(open)}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="glass settings-trigger-btn h-8 gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-foreground/85 hover:text-foreground"
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    <span className="capitalize">{sortBy}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="settings-popover glass z-[80] w-36 rounded-2xl p-1.5"
                >
                  <DropdownMenuItem
                    onClick={() => setSortBy("newest")}
                    className="settings-trigger-btn rounded-xl text-xs"
                  >
                    Newest
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy("priority")}
                    className="settings-trigger-btn rounded-xl text-xs"
                  >
                    Highest Priority
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy("alpha")}
                    className="settings-trigger-btn rounded-xl text-xs"
                  >
                    Alphabetical
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear Completed confirmation */}
              {completedCount > 0 && (
                <Popover
                  open={clearConfirmOpen}
                  onOpenChange={(open) => {
                    handlePopupSound(open);
                    setClearConfirmOpen(open);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="settings-trigger-btn h-8 gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-500/20 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear done</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    className="settings-popover glass z-[80] w-60 rounded-2xl p-4 text-foreground"
                  >
                    <h4 className="text-sm font-semibold">Clear completed?</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remove all {completedCount} finished tasks.
                    </p>
                    <div className="mt-3.5 flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          handlePopupSound(false);
                          setClearConfirmOpen(false);
                        }}
                        className="settings-trigger-btn h-7 rounded-lg text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleClearCompleted}
                        className="settings-trigger-btn h-7 rounded-lg text-xs"
                      >
                        Clear
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="mt-4 flex flex-col gap-2.5 pb-20">
          {visibleTodos.length === 0 ? (
            <GlassCard
              variant="panel"
              padding="lg"
              className="flex flex-col items-center justify-center text-center text-muted-foreground"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-foreground/5 text-muted-foreground">
                <CheckCircle2 className="h-6 w-6 opacity-60" />
              </div>
              <h3 className="mt-3 text-base font-medium text-foreground">
                {filter === "completed"
                  ? "No completed tasks"
                  : filter === "active"
                  ? "No active tasks"
                  : "No tasks"}
              </h3>
            </GlassCard>
          ) : (
            visibleTodos.map((item) => (
              <div
                key={item.id}
                onClick={() => handleToggle(item.id)}
                className={`group glass relative flex cursor-pointer flex-col gap-3 rounded-2xl p-3.5 transition-all duration-300 hover:bg-glass-strong sm:flex-row sm:items-center sm:justify-between ${
                  item.completed ? "opacity-65" : "opacity-100"
                }`}
              >
                {/* Left: Checkbox + Title + Days row */}
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                    className={`settings-trigger-btn flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-all ${
                      item.completed
                        ? "border-primary bg-primary text-primary-foreground shadow-sm reaction-chip-pop"
                        : "border-foreground/35 bg-background/60 hover:border-primary"
                    }`}
                  >
                    {item.completed && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium tracking-tight transition-all duration-300 ${
                        item.completed
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {item.text}
                    </p>

                    {/* Schedule Active Days Indicator (e.g. Mon–Fri for GYM) */}
                    {item.days && item.days.length > 0 && (
                      <div
                        className="mt-1.5 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] font-medium text-muted-foreground mr-0.5">
                          {item.repeat === "weekdays"
                            ? "Weekdays (Mon–Fri)"
                            : item.repeat === "daily"
                            ? "Daily"
                            : item.repeat === "weekends"
                            ? "Weekends"
                            : "Days"}:
                        </span>
                        {DAY_NAMES.map((name, dIdx) => {
                          const isActive = item.days?.includes(dIdx);
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={(e) => handleToggleDay(item.id, dIdx, e)}
                              title={`${name}: ${isActive ? "Alarm active" : "Silent"}`}
                              className={`h-4 min-w-4 rounded px-1 text-[9px] font-bold transition-all ${
                                isActive
                                  ? "bg-primary text-primary-foreground border border-primary shadow-xs"
                                  : "bg-foreground/8 text-muted-foreground border border-border/60 hover:bg-foreground/15 hover:text-foreground"
                              }`}
                            >
                              {name[0]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Alarm, Badges & Action Buttons */}
                <div
                  className="flex shrink-0 items-center gap-2 self-end sm:self-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Alarm indicator button */}
                  {item.alarmTime ? (
                    <button
                      type="button"
                      onClick={(e) => handleToggleAlarm(item.id, e)}
                      title={item.alarmEnabled ? `Alarm active at ${item.alarmTime}` : "Alarm paused"}
                      className={`settings-trigger-btn inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                        item.alarmEnabled
                          ? item.alarmFired
                            ? "border border-amber-500/45 bg-amber-500/20 text-amber-900 dark:text-amber-300"
                            : "border border-cyan-600/40 dark:border-cyan-500/40 bg-cyan-500/18 text-cyan-800 dark:text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                          : "border border-border/60 bg-foreground/8 text-muted-foreground opacity-75"
                      }`}
                    >
                      {item.alarmEnabled ? (
                        <Bell className="h-3 w-3 animate-pulse" />
                      ) : (
                        <BellOff className="h-3 w-3" />
                      )}
                      <span>{item.alarmTime}</span>
                    </button>
                  ) : null}

                  {/* Habit vs Task Indicator Pill */}
                  <span
                    className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      item.itemType === "habit" || (item.repeat && item.repeat !== "none")
                        ? "border border-cyan-600/35 dark:border-cyan-500/35 bg-cyan-500/18 text-cyan-900 dark:text-cyan-300"
                        : "border border-slate-500/35 bg-slate-500/18 text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {item.itemType === "habit" || (item.repeat && item.repeat !== "none") ? "Habit" : "Task"}
                  </span>

                  {/* Estimated Duration Badge */}
                  {item.estimatedTime && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border/60 bg-foreground/8 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Clock className="h-2.5 w-2.5 opacity-70" />
                      {item.estimatedTime}
                    </span>
                  )}

                  {/* High-Contrast Priority Indicator Pill */}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                      item.priority === "high"
                        ? "border border-rose-500/45 bg-rose-500/20 text-rose-800 dark:text-rose-300"
                        : item.priority === "medium"
                        ? "border border-amber-600/35 dark:border-amber-500/40 bg-amber-500/25 text-amber-950 dark:text-amber-300 font-bold shadow-xs"
                        : "border border-slate-500/40 bg-slate-500/20 text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {item.priority}
                  </span>

                  {/* Edit Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      handlePopupSound(true);
                      setEditingTodo({ ...item });
                      setEditPopupOpen(true);
                    }}
                    className="settings-trigger-btn h-7 w-7 rounded-lg text-muted-foreground opacity-80 hover:bg-foreground/10 hover:opacity-100 hover:text-foreground"
                    title="Edit task"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDelete(item.id, e)}
                    className="settings-trigger-btn h-7 w-7 rounded-lg text-muted-foreground opacity-80 hover:bg-rose-500/15 hover:opacity-100 hover:text-rose-600 dark:hover:text-rose-400"
                    title="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Auto-Plan Review Modal */}
      {planReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              handlePopupSound(false);
              setPlanReviewOpen(false);
            }}
          />

          <div
            data-state="open"
            className="settings-popover glass relative z-10 w-full max-w-lg rounded-[2rem] p-6 text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Planned Tasks</h3>
                <p className="text-xs text-muted-foreground">
                  {stagedTodos.length} task{stagedTodos.length !== 1 ? "s" : ""} detected
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  handlePopupSound(false);
                  setPlanReviewOpen(false);
                }}
                className="settings-trigger-btn h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="glass-scroll mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {stagedTodos.map((task, idx) => (
                <div
                  key={task.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/50 bg-card/50 p-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-foreground">{task.text}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    {task.alarmTime && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-600/35 dark:border-cyan-500/35 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:text-cyan-300">
                        <Bell className="h-2.5 w-2.5" />
                        {task.alarmTime}
                      </span>
                    )}
                    {task.repeat && task.repeat !== "none" && (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                        {task.repeat}
                      </span>
                    )}
                    {/* Habit vs Task Badge in Modal */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        task.itemType === "habit" || (task.repeat && task.repeat !== "none")
                          ? "bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-500/40"
                          : "bg-slate-500/20 text-slate-800 dark:text-slate-300 border border-slate-500/40"
                      }`}
                    >
                      {task.itemType === "habit" || (task.repeat && task.repeat !== "none") ? "Habit" : "Task"}
                    </span>
                    {/* High-Contrast Priority Badge in Modal */}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                        task.priority === "high"
                          ? "bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/40"
                          : task.priority === "medium"
                          ? "bg-amber-500/25 text-amber-950 dark:text-amber-300 border border-amber-600/30 dark:border-amber-500/40 font-bold shadow-xs"
                          : "bg-slate-500/20 text-slate-800 dark:text-slate-300 border border-slate-500/40"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAcceptPlan("replace")}
                className="settings-trigger-btn text-xs text-muted-foreground hover:text-foreground"
              >
                Replace list
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handlePopupSound(false);
                    setPlanReviewOpen(false);
                  }}
                  className="settings-trigger-btn text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>

                {/* High-Contrast "Add" Button (100% visible in both light & dark themes) */}
                <Button
                  size="sm"
                  onClick={() => handleAcceptPlan("append")}
                  className="btn-ink settings-trigger-btn rounded-full border border-foreground/15 px-6 py-2 text-xs font-bold text-primary-foreground shadow-lg transition-all hover:opacity-95 active:scale-95"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Edit Popover / Modal */}
      {editPopupOpen && editingTodo && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              handlePopupSound(false);
              setEditPopupOpen(false);
            }}
          />
          <div
            data-state="open"
            className="settings-popover glass relative z-10 w-full max-w-sm rounded-[2rem] p-5 text-foreground shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit Task</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  handlePopupSound(false);
                  setEditPopupOpen(false);
                }}
                className="settings-trigger-btn h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3.5 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Task Title</label>
                <Input
                  value={editingTodo.text}
                  onChange={(e) =>
                    setEditingTodo({ ...editingTodo, text: e.target.value })
                  }
                  className="mt-1 rounded-xl border-border/60 bg-background/60 text-sm text-foreground"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Priority</label>
                  <select
                    value={editingTodo.priority}
                    onChange={(e) =>
                      setEditingTodo({
                        ...editingTodo,
                        priority: e.target.value as PriorityLevel,
                      })
                    }
                    className="settings-trigger-btn mt-1 w-full rounded-xl border border-border/60 bg-background/70 p-2 text-xs font-medium text-foreground outline-none"
                  >
                    <option value="high" className="bg-popover text-popover-foreground">High</option>
                    <option value="medium" className="bg-popover text-popover-foreground">Medium</option>
                    <option value="low" className="bg-popover text-popover-foreground">Low</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Alarm (e.g. 6:00 PM)</label>
                  <Input
                    value={editingTodo.alarmTime || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = extractAlarmFromText(`at ${val}`, editingTodo.days);
                      setEditingTodo({
                        ...editingTodo,
                        alarmTime: val || undefined,
                        alarmTimestamp: parsed.alarmTimestamp || undefined,
                        alarmEnabled: Boolean(val),
                        alarmFired: false,
                      });
                    }}
                    placeholder="6:00 PM"
                    className="mt-1 rounded-xl border-border/60 bg-background/60 text-xs text-foreground"
                  />
                </div>
              </div>

              {/* Active Days for Recurring Alarm */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Active Days</label>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  {DAY_NAMES.map((name, dIdx) => {
                    const days = editingTodo.days || [0, 1, 2, 3, 4, 5, 6];
                    const isActive = days.includes(dIdx);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          const nextDays = isActive
                            ? days.filter((d) => d !== dIdx)
                            : [...days, dIdx].sort();
                          setEditingTodo({
                            ...editingTodo,
                            days: nextDays,
                            repeat: nextDays.length === 5 && !nextDays.includes(0) && !nextDays.includes(6)
                              ? "weekdays"
                              : nextDays.length === 7
                              ? "daily"
                              : "custom",
                          });
                        }}
                        className={`h-7 w-8 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? "bg-primary text-primary-foreground border border-primary shadow-sm"
                            : "bg-foreground/8 text-muted-foreground border border-border/60 hover:bg-foreground/15 hover:text-foreground"
                        }`}
                      >
                        {name.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handlePopupSound(false);
                  setEditPopupOpen(false);
                }}
                className="settings-trigger-btn h-8 rounded-lg text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="settings-trigger-btn h-8 rounded-lg text-xs font-semibold"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default TodoView;
