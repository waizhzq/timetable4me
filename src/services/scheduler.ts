import type { Task, FixedEvent, StudySession, UserPreferences } from './db';

// Days of the week in order for indexing
const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface ScheduleResult {
  sessions: StudySession[];
  conflictedTaskIds: string[]; // Tasks that couldn't be fully scheduled
  priorityScores: { [taskId: string]: number };
}

/**
 * Calculates priority score for a task.
 * Priority Score = Urgency + Importance + Remaining Hours
 */
export const calculatePriorityScore = (task: Task, now: Date = new Date()): number => {
  if (task.status === 'completed' || task.completedHours >= task.estimatedHours) {
    return 0;
  }

  // 1. Urgency Score
  let urgencyScore = 5; 
  if (task.hasDeadline && task.deadline) {
    const deadlineDate = new Date(task.deadline + 'T23:59:59');
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffHours = diffTime / (1000 * 60 * 60);

    if (diffHours < 0) {
      urgencyScore = 100;
    } else if (diffHours <= 24) {
      urgencyScore = 50;
    } else if (diffHours <= 72) {
      urgencyScore = 30;
    } else if (diffHours <= 168) {
      urgencyScore = 15;
    }
  }

  // 2. Importance Score (based on priority)
  let importanceScore = 10;
  if (task.priority === 'high') {
    importanceScore = 40;
  } else if (task.priority === 'medium') {
    importanceScore = 20;
  }

  // 3. Remaining Hours
  const remainingHours = Math.max(0, task.estimatedHours - task.completedHours);

  return urgencyScore + importanceScore + remainingHours;
};

/**
 * Parses time string "HH:MM" into decimal hours (e.g. "09:30" -> 9.5)
 */
const parseTimeToDecimal = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
};

/**
 * Checks if a specific 1-hour slot (e.g., hour 9 is 09:00 - 10:00) overlaps with a fixed event.
 */
const isOverlappingFixedEvent = (
  date: Date,
  hour: number,
  events: FixedEvent[]
): boolean => {
  const dayName = DAYS_OF_WEEK[date.getDay()];
  const dateStr = date.toISOString().split('T')[0];

  for (const event of events) {
    // Check recurrence match
    if (event.recurring) {
      if (event.day !== dayName) continue;
    } else {
      if (event.date !== dateStr) continue;
    }

    const startDecimal = parseTimeToDecimal(event.startTime);
    const endDecimal = parseTimeToDecimal(event.endTime);

    // If our 1-hour slot [hour, hour + 1] overlaps with event [startDecimal, endDecimal]
    // Overlap condition: start1 < end2 && start2 < end1
    if (hour < endDecimal && startDecimal < hour + 1) {
      return true;
    }
  }

  return false;
};

/**
 * Core Scheduling Engine.
 * Generates an optimized, distributed list of study sessions.
 */
export const generateSchedule = (
  tasks: Task[],
  events: FixedEvent[],
  preferences: UserPreferences,
  startDate: Date = new Date()
): ScheduleResult => {
  const sessions: StudySession[] = [];
  const conflictedTaskIds: string[] = [];
  const priorityScores: { [taskId: string]: number } = {};

  // 1. Filter out completed tasks and calculate priority scores
  const activeTasks = tasks
    .filter((t) => t.status !== 'completed' && t.completedHours < t.estimatedHours)
    .map((t) => {
      const score = calculatePriorityScore(t, startDate);
      priorityScores[t.id] = score;
      return {
        ...t,
        score,
        remainingHours: t.estimatedHours - t.completedHours,
      };
    });

  // Sort tasks by priority score descending
  activeTasks.sort((a, b) => b.score - a.score);

  // 2. Generate the calendar grid for the next 14 days
  // We divide each day into 1-hour slots based on preferences.earliestStudyTime and preferences.latestStudyTime
  const startHour = Math.floor(parseTimeToDecimal(preferences.earliestStudyTime));
  const endHour = Math.ceil(parseTimeToDecimal(preferences.latestStudyTime));

  interface DaySlots {
    date: Date;
    dateStr: string;
    slots: {
      hour: number;
      bookedTaskId: string | null;
    }[];
  }

  const calendarGrid: DaySlots[] = [];

  for (let i = 0; i < 14; i++) {
    const d = new Date(startDate.getTime());
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const slots: { hour: number; bookedTaskId: string | null }[] = [];

    for (let hour = startHour; hour < endHour; hour++) {
      // Avoid scheduling in the past for "today"
      if (i === 0) {
        const currentHour = startDate.getHours();
        if (hour <= currentHour) {
          continue; // Skip past hours today
        }
      }

      // Check if slot overlaps any fixed event
      let isBlocked = isOverlappingFixedEvent(d, hour, events);

      // Check if slot overlaps any manually scheduled task
      if (!isBlocked) {
        for (const task of tasks) {
          if (task.status !== 'completed' && task.startTime && task.endTime) {
            // Block today's slots for specific-time tasks
            if (dateStr === startDate.toISOString().split('T')[0]) {
              const startDec = parseTimeToDecimal(task.startTime);
              const endDec = parseTimeToDecimal(task.endTime);
              if (hour < endDec && startDec < hour + 1) {
                isBlocked = true;
                break;
              }
            }
          }
        }
      }

      slots.push({
        hour,
        bookedTaskId: isBlocked ? 'BLOCKED_BY_EVENT' : null,
      });
    }

    calendarGrid.push({
      date: d,
      dateStr,
      slots,
    });
  }

  // Track daily total study hours to enforce maxStudyHoursPerDay
  const dailyStudyHours: { [dateStr: string]: number } = {};
  calendarGrid.forEach((day) => {
    dailyStudyHours[day.dateStr] = 0;
  });

  // Helper: check how many days are available before a deadline date string
  const getDaysAvailableBefore = (deadlineStr: string): number => {
    const deadline = new Date(deadlineStr + 'T23:59:59');
    const diff = deadline.getTime() - startDate.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // 3. First Pass: Even distribution
  activeTasks.forEach((task) => {
    const deadlineStr = task.hasDeadline && task.deadline ? task.deadline : getFutureDateStr(startDate, 14);
    const daysAvailable = getDaysAvailableBefore(deadlineStr);
    
    if (daysAvailable <= 0) return;

    const targetHoursPerDay = Math.min(2, Math.ceil(task.remainingHours / daysAvailable));

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const day = calendarGrid[dayOffset];
      if (!day || day.dateStr > deadlineStr || task.remainingHours <= 0) break;

      // Enforce global daily cap
      const currentDayTotal = dailyStudyHours[day.dateStr] || 0;
      if (currentDayTotal >= preferences.maxStudyHoursPerDay) {
        continue;
      }

      // Allocate up to targetHoursPerDay for this task on this day
      let dayAllocated = 0;
      for (const slot of day.slots) {
        if (slot.bookedTaskId === null && dayAllocated < targetHoursPerDay) {
          slot.bookedTaskId = task.id;
          task.remainingHours -= 1;
          dayAllocated += 1;
          dailyStudyHours[day.dateStr] = (dailyStudyHours[day.dateStr] || 0) + 1;

          if (task.remainingHours <= 0) {
            break;
          }

          const currentDayTotalNew = dailyStudyHours[day.dateStr] || 0;
          if (currentDayTotalNew >= preferences.maxStudyHoursPerDay) {
            break;
          }
        }
      }
    }
  });

  // 4. Second Pass: Sweep overflow
  activeTasks.forEach((task) => {
    if (task.remainingHours <= 0) return;
    const deadlineStr = task.hasDeadline && task.deadline ? task.deadline : getFutureDateStr(startDate, 14);

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const day = calendarGrid[dayOffset];
      if (!day || day.dateStr > deadlineStr || task.remainingHours <= 0) break;

      // Enforce global daily cap
      const currentDayTotal = dailyStudyHours[day.dateStr] || 0;
      if (currentDayTotal >= preferences.maxStudyHoursPerDay) {
        continue;
      }

      for (const slot of day.slots) {
        if (slot.bookedTaskId === null) {
          slot.bookedTaskId = task.id;
          task.remainingHours -= 1;
          dailyStudyHours[day.dateStr] = (dailyStudyHours[day.dateStr] || 0) + 1;

          if (task.remainingHours <= 0) {
            break;
          }

          const currentDayTotalNew = dailyStudyHours[day.dateStr] || 0;
          if (currentDayTotalNew >= preferences.maxStudyHoursPerDay) {
            break;
          }
        }
      }
    }

    // If still has hours left, it's conflicted/insufficient time
    if (task.remainingHours > 0) {
      conflictedTaskIds.push(task.id);
    }
  });

  // 5. Convert booked slots in calendar grid into StudySession objects
  let sessionIdCounter = 1;
  calendarGrid.forEach((day) => {
    // Sort slots by hour to ensure chronological order
    const daySlots = [...day.slots].sort((a, b) => a.hour - b.hour);

    // Merge consecutive slots for the same task to make clean block sessions
    let currentSession: {
      taskId: string;
      taskTitle: string;
      startHour: number;
      endHour: number;
    } | null = null;

    const commitCurrentSession = () => {
      if (currentSession) {
        const startISO = new Date(day.date);
        startISO.setHours(currentSession.startHour, 0, 0, 0);

        const endISO = new Date(day.date);
        endISO.setHours(currentSession.endHour, 0, 0, 0);

        sessions.push({
          id: `session-${Date.now()}-${sessionIdCounter++}`,
          taskId: currentSession.taskId,
          taskTitle: currentSession.taskTitle,
          start: startISO.toISOString(),
          end: endISO.toISOString(),
          completed: false,
        });
        currentSession = null;
      }
    };

    daySlots.forEach((slot) => {
      if (slot.bookedTaskId && slot.bookedTaskId !== 'BLOCKED_BY_EVENT') {
        const taskTitle =
          tasks.find((t) => t.id === slot.bookedTaskId)?.title || 'Study Session';

        if (currentSession && currentSession.taskId === slot.bookedTaskId) {
          // Extend existing session
          currentSession.endHour = slot.hour + 1;
        } else {
          // Commit previous session if any
          commitCurrentSession();
          // Start new session
          currentSession = {
            taskId: slot.bookedTaskId,
            taskTitle,
            startHour: slot.hour,
            endHour: slot.hour + 1,
          };
        }
      } else {
        // Not a study slot or blocked, commit current session if any
        commitCurrentSession();
      }
    });

    // Commit any session left at end of day
    commitCurrentSession();
  });

  // 6. Append manually scheduled task sessions
  tasks.forEach((task) => {
    if (task.startTime && task.endTime) {
      // Treat specific time tasks as occurring TODAY
      const today = startDate.toISOString().split('T')[0];
      const startISO = new Date(today + 'T' + task.startTime + ':00');
      const endISO = new Date(today + 'T' + task.endTime + ':00');

      sessions.push({
        id: `session-fixed-task-${task.id}`,
        taskId: task.id,
        taskTitle: task.title,
        start: startISO.toISOString(),
        end: endISO.toISOString(),
        completed: task.status === 'completed',
      });
    }
  });

  return {
    sessions,
    conflictedTaskIds,
    priorityScores,
  };
};

const getFutureDateStr = (date: Date, days: number): string => {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
