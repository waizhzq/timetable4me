import type { Task, FixedEvent, StudySession, UserPreferences } from './db';

export interface ScheduleResult {
  sessions: StudySession[];
  conflictedTaskIds: string[]; 
  priorityScores: { [taskId: string]: number };
}

/**
 * Calculates priority score for a task.
 */
export const calculatePriorityScore = (task: Task, now: Date = new Date()): number => {
  if (task.status === 'completed') {
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

  return urgencyScore + importanceScore;
};

/**
 * Core Scheduling Engine.
 * Only returns user-defined specific time task sessions.
 */
export const generateSchedule = (
  tasks: Task[],
  _events: FixedEvent[],
  _preferences: UserPreferences,
  startDate: Date = new Date()
): ScheduleResult => {
  const sessions: StudySession[] = [];
  const conflictedTaskIds: string[] = [];
  const priorityScores: { [taskId: string]: number } = {};

  tasks.forEach((t) => {
    priorityScores[t.id] = calculatePriorityScore(t, startDate);
  });

  tasks.forEach((task) => {
    if (task.startTime && task.endTime) {
      const taskDateStr = task.hasDeadline && task.deadline ? task.deadline : startDate.toISOString().split('T')[0];
      
      // Parse YYYY-MM-DD locally to avoid timezone shifts
      const [y, m, d] = taskDateStr.split('-').map(Number);
      const [sh, sm] = task.startTime.split(':').map(Number);
      const [eh, em] = task.endTime.split(':').map(Number);

      const startISO = new Date(y, m - 1, d, sh, sm);
      const endISO = new Date(y, m - 1, d, eh, em);

      if (endISO < startISO) {
        endISO.setDate(endISO.getDate() + 1);
      }

      const fmtLocal = (date: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      };

      sessions.push({
        id: `session-fixed-task-${task.id}`,
        taskId: task.id,
        taskTitle: task.title,
        start: fmtLocal(startISO),
        end: fmtLocal(endISO),
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
