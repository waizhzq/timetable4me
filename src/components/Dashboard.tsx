import React, { useState } from 'react';
import type { Task, FixedEvent, StudySession, UserPreferences } from '../services/db';
import { calculatePriorityScore } from '../services/scheduler';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Bookmark,
  Star,
  ArrowRight,
  FileText,
  AlertCircle,
  CheckSquare,
  Square
} from 'lucide-react';

interface DashboardProps {
  tasks: Task[];
  events: FixedEvent[];
  sessions: StudySession[];
  preferences: UserPreferences;
  onToggleSession: (
    sessionId: string,
    completed: boolean,
    hours: number,
    taskId: string
  ) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onUpdateEvent: (eventId: string, updates: Partial<FixedEvent>) => Promise<void>;
  setView: (view: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  events,
  sessions,
  preferences,
  onToggleSession,
  onUpdateTask,
  onUpdateEvent,
  setView,
}) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayDayName = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][now.getDay()];

  // Active Selected Block state for Inspector
  const [selectedBlock, setSelectedBlock] = useState<{
    type: 'study' | 'fixed';
    id: string; // session id or fixed event id
    dbId: string; // task id or fixed event id
    title: string;
    category: string;
    start: string;
    end: string;
    completed: boolean;
  } | null>(null);

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // ----------------------------------------------------
  // Date Helpers for Weekly Timetable
  // ----------------------------------------------------
  const getMonday = (d: Date): Date => {
    const date = new Date(d.getTime());
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const mondayDate = getMonday(now);
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(mondayDate.getTime());
    d.setDate(mondayDate.getDate() + i);
    return d;
  });

  const startHour = Math.floor(parseInt(preferences.earliestStudyTime.split(':')[0]));
  const endHour = Math.ceil(parseInt(preferences.latestStudyTime.split(':')[0]));
  const hours = Array.from({ length: endHour - startHour }).map((_, i) => startHour + i);

  // ----------------------------------------------------
  // Fetch details of Selected Block for Inspector
  // ----------------------------------------------------
  let inspectorDetails: {
    title: string;
    type: 'study' | 'fixed';
    category: string;
    timeRange: string;
    priority?: string;
    deadline?: string;
    notes: string;
    subtasks: { id: string; text: string; completed: boolean }[];
    isOverdue?: boolean;
  } | null = null;

  if (selectedBlock) {
    if (selectedBlock.type === 'fixed') {
      const matchedEvent = events.find((e) => e.id === selectedBlock.dbId);
      if (matchedEvent) {
        inspectorDetails = {
          title: matchedEvent.title,
          type: 'fixed',
          category: matchedEvent.type,
          timeRange: `${matchedEvent.recurring ? matchedEvent.day : matchedEvent.date} • ${matchedEvent.startTime} - ${matchedEvent.endTime}`,
          notes: matchedEvent.notes || 'No description or notes added for this commitment.',
          subtasks: [],
        };
      }
    } else {
      const matchedSession = sessions.find((s) => s.id === selectedBlock.id);
      const matchedTask = tasks.find((t) => t.id === selectedBlock.dbId);
      if (matchedSession && matchedTask) {
        const sTime = new Date(matchedSession.start);
        const eTime = new Date(matchedSession.end);
        const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
        const timeRangeStr = `${sTime.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${sTime.toLocaleTimeString([], options)} - ${eTime.toLocaleTimeString([], options)}`;

        const dl = new Date(matchedTask.deadline + 'T23:59:59');
        const isOverdue = dl.getTime() < now.getTime() && matchedTask.status !== 'completed';

        inspectorDetails = {
          title: matchedTask.title,
          type: 'study',
          category: 'study block',
          timeRange: timeRangeStr,
          priority: matchedTask.priority,
          deadline: matchedTask.deadline,
          notes: matchedTask.notes || 'No notes added. Write study notes or details below.',
          subtasks: matchedTask.subtasks || [],
          isOverdue,
        };
      }
    }
  }

  // ----------------------------------------------------
  // Inspector Actions
  // ----------------------------------------------------
  const handleToggleSubtask = async (subtaskId: string) => {
    if (!selectedBlock || selectedBlock.type !== 'study' || !inspectorDetails) return;
    const matchedTask = tasks.find((t) => t.id === selectedBlock.dbId);
    if (!matchedTask) return;

    const updatedSubtasks = (matchedTask.subtasks || []).map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    await onUpdateTask(matchedTask.id, { subtasks: updatedSubtasks });
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskText.trim() || !selectedBlock || selectedBlock.type !== 'study') return;
    const matchedTask = tasks.find((t) => t.id === selectedBlock.dbId);
    if (!matchedTask) return;

    const newSub = {
      id: `sub-${Date.now()}`,
      text: newSubtaskText.trim(),
      completed: false,
    };
    const updatedSubtasks = [...(matchedTask.subtasks || []), newSub];

    await onUpdateTask(matchedTask.id, { subtasks: updatedSubtasks });
    setNewSubtaskText('');
  };

  const handleSaveNotes = async () => {
    if (!selectedBlock) return;
    if (selectedBlock.type === 'study') {
      await onUpdateTask(selectedBlock.dbId, { notes: noteText });
    } else {
      await onUpdateEvent(selectedBlock.dbId, { notes: noteText });
    }
    setIsEditingNotes(false);
  };

  const handleStartEditingNotes = () => {
    if (inspectorDetails) {
      setNoteText(inspectorDetails.notes);
      setIsEditingNotes(true);
    }
  };

  // Helper decimal conversion
  const timeToDecimal = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };

  // ----------------------------------------------------
  // Dashboard Calculations
  // ----------------------------------------------------
  const activeTasks = tasks
    .filter((t) => t.status !== 'completed' && t.completedHours < t.estimatedHours)
    .map((t) => ({
      ...t,
      score: calculatePriorityScore(t, now),
      remainingHours: Math.max(0, t.estimatedHours - t.completedHours),
    }))
    .sort((a, b) => b.score - a.score);

  const upcomingDeadlines = [...activeTasks].sort((a, b) => {
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const weeklyPriorities = activeTasks.slice(0, 3);

  const todayFixedEvents = events
    .filter((e) => {
      if (e.recurring) {
        return e.day === todayDayName;
      } else {
        return e.date === todayStr;
      }
    })
    .map((e) => {
      const start = new Date();
      const [sh, sm] = e.startTime.split(':').map(Number);
      start.setHours(sh, sm, 0, 0);

      const end = new Date();
      const [eh, em] = e.endTime.split(':').map(Number);
      end.setHours(eh, em, 0, 0);

      return {
        id: e.id,
        dbId: e.id,
        title: e.title,
        type: 'fixed' as const,
        eventType: e.type,
        start: start.toISOString(),
        end: end.toISOString(),
        completed: false,
      };
    });

  const todayStudySessions = sessions
    .filter((s) => s.start.startsWith(todayStr))
    .map((s) => ({
      id: s.id,
      dbId: s.taskId,
      title: s.taskTitle,
      type: 'study' as const,
      eventType: 'study',
      start: s.start,
      end: s.end,
      completed: s.completed,
    }));

  const todayTimeline = [...todayFixedEvents, ...todayStudySessions].sort((a, b) => {
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });

  const formatTimeRange = (startISO: string, endISO: string) => {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    return `${s.toLocaleTimeString([], options)} - ${e.toLocaleTimeString([], options)}`;
  };

  const getUrgencyClass = (deadlineStr: string) => {
    const dl = new Date(deadlineStr + 'T23:59:59');
    const diff = dl.getTime() - now.getTime();
    const diffDays = diff / (1000 * 60 * 60 * 24);

    if (diffDays <= 1) return 'badge-critical';
    if (diffDays <= 3) return 'badge-high';
    if (diffDays <= 7) return 'badge-medium';
    return 'badge-low';
  };

  const getUrgencyLabel = (deadlineStr: string) => {
    const dl = new Date(deadlineStr + 'T23:59:59');
    const diff = dl.getTime() - now.getTime();
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${deadlineStr}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ----------------------------------------------------
          1. TOP WEEKLY SQUARE TIMETABLE
          ---------------------------------------------------- */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar className="logo-icon" size={20} />
            <h3>Weekly Overview Timetable</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Week: {mondayDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Square timetable grid container */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px repeat(7, 1fr)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            overflow: 'hidden',
            backgroundColor: 'rgba(0,0,0,0.1)',
          }}
        >
          {/* Top Left Corner */}
          <div style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.01)' }} />

          {/* Days headers */}
          {weekDates.map((date, idx) => {
            const isToday = date.toDateString() === now.toDateString();
            return (
              <div
                key={idx}
                style={{
                  padding: '6px 4px',
                  textAlign: 'center',
                  borderBottom: '1px solid var(--border-color)',
                  borderRight: idx === 6 ? 'none' : '1px solid var(--border-color)',
                  backgroundColor: isToday ? 'var(--primary-glow)' : 'rgba(255,255,255,0.01)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isToday ? 'var(--primary)' : '#fff' }}>
                  {DAYS_SHORT[idx]}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}

          {/* Timetable Rows */}
          {hours.map((hour) => (
            <React.Fragment key={hour}>
              {/* Hour Label */}
              <div
                style={{
                  padding: '6px 4px',
                  textAlign: 'right',
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-color)',
                  borderRight: '1px solid var(--border-color)',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>

              {/* Day cells for this hour */}
              {weekDates.map((date, dayIdx) => {
                const dateStr = date.toISOString().split('T')[0];
                const dayName = DAYS_FULL[date.getDay() === 0 ? 6 : date.getDay() - 1];

                // Check for fixed events starting at this hour
                const matchingFixed = events.find((e) => {
                  if (e.recurring) {
                    if (e.day !== dayName) return false;
                  } else {
                    if (e.date !== dateStr) return false;
                  }
                  const startDec = timeToDecimal(e.startTime);
                  return Math.floor(startDec) === hour;
                });

                // Check for study sessions starting at this hour on this date
                const matchingStudy = sessions.find((s) => {
                  if (!s.start.startsWith(dateStr)) return false;
                  const sHour = new Date(s.start).getHours();
                  return sHour === hour;
                });

                // Check if covered by a block starting in an earlier hour
                const isCoveredByEvent = events.some((e) => {
                  if (e.recurring) {
                    if (e.day !== dayName) return false;
                  } else {
                    if (e.date !== dateStr) return false;
                  }
                  const startDec = timeToDecimal(e.startTime);
                  const endDec = timeToDecimal(e.endTime);
                  return hour > Math.floor(startDec) && hour < endDec;
                });

                const isCoveredBySession = sessions.some((s) => {
                  if (!s.start.startsWith(dateStr)) return false;
                  const sStartHour = new Date(s.start).getHours();
                  const sEndHour = new Date(s.end).getHours();
                  return hour > sStartHour && hour < sEndHour;
                });

                const isCovered = isCoveredByEvent || isCoveredBySession;

                if (isCovered) {
                  return (
                    <div
                      key={dayIdx}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        borderRight: dayIdx === 6 ? 'none' : '1px solid var(--border-color)',
                        height: '36px',
                      }}
                    />
                  );
                }

                return (
                  <div
                    key={dayIdx}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      borderRight: dayIdx === 6 ? 'none' : '1px solid var(--border-color)',
                      height: '36px',
                      position: 'relative',
                    }}
                  >
                    {/* Render Fixed Event */}
                    {matchingFixed && (
                      (() => {
                        const startDec = timeToDecimal(matchingFixed.startTime);
                        const endDec = timeToDecimal(matchingFixed.endTime);
                        const span = endDec - startDec;
                        const isSelected = selectedBlock?.type === 'fixed' && selectedBlock?.dbId === matchingFixed.id;

                        return (
                          <div
                            onClick={() =>
                              setSelectedBlock({
                                type: 'fixed',
                                id: matchingFixed.id,
                                dbId: matchingFixed.id,
                                title: matchingFixed.title,
                                category: matchingFixed.type,
                                start: matchingFixed.startTime,
                                end: matchingFixed.endTime,
                                completed: false,
                              })
                            }
                            style={{
                              position: 'absolute',
                              top: `${(startDec - Math.floor(startDec)) * 36 + 1}px`,
                              left: '1px',
                              right: '1px',
                              height: `${span * 36 - 2}px`,
                              borderRadius: '4px',
                              fontSize: '0.6rem',
                              padding: '2px 4px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              zIndex: 10,
                              backgroundColor: matchingFixed.type === 'training' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                              border: isSelected
                                ? '1.5px solid var(--primary)'
                                : matchingFixed.type === 'training'
                                ? '1px solid rgba(245, 158, 11, 0.5)'
                                : '1px solid rgba(59, 130, 246, 0.5)',
                              color: matchingFixed.type === 'training' ? '#fde047' : '#93c5fd',
                              boxShadow: isSelected ? '0 0 8px var(--primary-glow)' : 'none',
                            }}
                          >
                            {matchingFixed.title}
                          </div>
                        );
                      })()
                    )}

                    {/* Render Study Session */}
                    {matchingStudy && (
                      (() => {
                        const sTime = new Date(matchingStudy.start);
                        const eTime = new Date(matchingStudy.end);
                        const startDec = sTime.getHours() + sTime.getMinutes() / 60;
                        const endDec = eTime.getHours() + eTime.getMinutes() / 60;
                        const span = endDec - startDec;
                        const isSelected = selectedBlock?.type === 'study' && selectedBlock?.id === matchingStudy.id;

                        return (
                          <div
                            onClick={() =>
                              setSelectedBlock({
                                type: 'study',
                                id: matchingStudy.id,
                                dbId: matchingStudy.taskId,
                                title: matchingStudy.taskTitle,
                                category: 'study block',
                                start: matchingStudy.start,
                                end: matchingStudy.end,
                                completed: matchingStudy.completed,
                              })
                            }
                            style={{
                              position: 'absolute',
                              top: `${(startDec - Math.floor(startDec)) * 36 + 1}px`,
                              left: '1px',
                              right: '1px',
                              height: `${span * 36 - 2}px`,
                              borderRadius: '4px',
                              fontSize: '0.6rem',
                              padding: '2px 4px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              zIndex: 10,
                              backgroundColor: matchingStudy.completed ? 'rgba(16, 185, 129, 0.08)' : 'var(--primary-glow)',
                              border: isSelected
                                ? '1.5px solid var(--primary)'
                                : matchingStudy.completed
                                ? '1px solid rgba(16, 185, 129, 0.3)'
                                : '1px dashed var(--primary)',
                              color: matchingStudy.completed ? '#a7f3d0' : '#ddd6fe',
                              opacity: matchingStudy.completed ? 0.65 : 1,
                              textDecoration: matchingStudy.completed ? 'line-through' : 'none',
                              boxShadow: isSelected ? '0 0 8px var(--primary-glow)' : 'none',
                            }}
                          >
                            📖 {matchingStudy.taskTitle}
                          </div>
                        );
                      })()
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------
          2. DETAILED INSPECTOR PANEL (Pops out below Schedule)
          ---------------------------------------------------- */}
      {selectedBlock && inspectorDetails ? (
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(139, 92, 246, 0.04) 100%)',
            border: '1.5px solid rgba(139, 92, 246, 0.3)',
            boxShadow: 'var(--shadow-glow)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    backgroundColor: selectedBlock.type === 'study' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                    color: selectedBlock.type === 'study' ? '#c084fc' : '#22d3ee',
                  }}
                >
                  {inspectorDetails.category}
                </span>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>{inspectorDetails.title}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                <Clock size={12} />
                <span>{inspectorDetails.timeRange}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedBlock(null)}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
            {/* Left Box: Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                  <FileText size={16} className="logo-icon" />
                  <span>Commitment Notes</span>
                </div>
                {!isEditingNotes ? (
                  <button
                    onClick={handleStartEditingNotes}
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                  >
                    Edit Notes
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleSaveNotes}
                      className="btn btn-primary"
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingNotes(false)}
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {!isEditingNotes ? (
                <div
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.15)',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    lineHeight: '1.5',
                    color: 'var(--text-primary)',
                    minHeight: '80px',
                    border: '1px solid var(--border-color)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {inspectorDetails.notes}
                </div>
              ) : (
                <textarea
                  className="form-control"
                  style={{ width: '100%', minHeight: '80px', fontSize: '0.85rem', resize: 'vertical' }}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type notes, room locations, guidelines..."
                />
              )}

              {/* Task Meta details */}
              {selectedBlock.type === 'study' && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                  <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Priority</div>
                    <div style={{ marginTop: '2px' }}>
                      <span className={`badge badge-${inspectorDetails.priority}`}>{inspectorDetails.priority}</span>
                    </div>
                  </div>

                  <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Deadline</div>
                    <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 650, color: '#fff' }}>{inspectorDetails.deadline}</span>
                      {inspectorDetails.isOverdue && <span className="badge badge-critical" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>Overdue</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Box: Sub-task Checklist (Study Block only) */}
            <div>
              {selectedBlock.type === 'study' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                    <CheckSquare size={16} className="logo-icon" />
                    <span>Sub-task Checklist (Bullet Points)</span>
                  </div>

                  {inspectorDetails.subtasks.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.5rem', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px', textAlign: 'center' }}>
                      No sub-tasks added yet. Type below to add bullets.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                      {inspectorDetails.subtasks.map((st) => (
                        <div
                          key={st.id}
                          onClick={() => handleToggleSubtask(st.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(255,255,255,0.01)',
                            transition: 'background var(--transition-fast)',
                          }}
                          className="subtask-row-hover"
                        >
                          {st.completed ? (
                            <CheckSquare size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                          ) : (
                            <Square size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          )}
                          <span style={{ color: st.completed ? 'var(--text-secondary)' : '#fff', textDecoration: st.completed ? 'line-through' : 'none' }}>
                            {st.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Subtask Bullet */}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '6px', marginTop: '0.25rem' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Add sub-task checklist item..."
                      value={newSubtaskText}
                      onChange={(e) => setNewSubtaskText(e.target.value)}
                      style={{ flexGrow: 1, padding: '6px 12px', fontSize: '0.8rem' }}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      Add
                    </button>
                  </form>
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  <AlertCircle size={20} style={{ marginBottom: '4px', display: 'block', margin: '0 auto 6px' }} />
                  <span>Checklists are only available for academic tasks and study blocks.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: '1.25rem',
            textAlign: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            borderStyle: 'dashed',
            borderColor: 'var(--border-color)',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            💡 <strong>Interactive Weekly Timetable:</strong> Click any event block in the grid above to edit notes, view deadlines, and complete task checklists.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------
          3. MAIN TWO-COLUMN DASHBOARD GRID
          ---------------------------------------------------- */}
      <div className="dashboard-grid">
        
        {/* Left Column: Today's Schedule timeline list */}
        <div className="dashboard-panel-left">
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock className="logo-icon" size={20} />
                <h3>Today's Schedule</h3>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {todayDayName}, {now.toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {todayTimeline.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                <Calendar size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                <p>No classes, training, or study sessions scheduled for today!</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => setView('tasks')}
                  style={{ marginTop: '1rem' }}
                >
                  Add assignments to generate slots
                </button>
              </div>
            ) : (
              <div className="timeline">
                {todayTimeline.map((item) => {
                  const isStudy = item.type === 'study';
                  const durationHours =
                    (new Date(item.end).getTime() - new Date(item.start).getTime()) /
                    (1000 * 60 * 60);

                  return (
                    <div key={item.id} className="timeline-item">
                      <div className="timeline-time">
                        {formatTimeRange(item.start, item.end)}
                      </div>
                      <div className="timeline-marker">
                        <div className={`timeline-dot ${isStudy ? 'study' : 'fixed'}`} />
                        <div className="timeline-line" />
                      </div>
                      <div className="timeline-content">
                        <div className={`timeline-card ${isStudy ? 'study' : 'fixed'}`}>
                          <div
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              setSelectedBlock({
                                type: item.type,
                                id: item.id,
                                dbId: item.dbId,
                                title: item.title,
                                category: isStudy ? 'study block' : 'fixed commitment',
                                start: item.start,
                                end: item.end,
                                completed: item.completed,
                              })
                            }
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, color: '#fff' }}>
                                {item.title}
                              </span>
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 6px',
                                  backgroundColor: isStudy
                                    ? 'rgba(234, 84, 85, 0.15)'
                                    : item.eventType === 'class'
                                    ? 'rgba(240, 123, 63, 0.15)'
                                    : 'rgba(255, 212, 96, 0.12)',
                                  color: isStudy
                                    ? '#fca5a5'
                                    : item.eventType === 'class'
                                    ? '#ffb793'
                                    : '#ffe39e',
                                }}
                              >
                                {isStudy
                                  ? 'Study Block'
                                  : item.eventType === 'class'
                                  ? 'Class'
                                  : 'Training'}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                marginTop: '0.25rem',
                              }}
                            >
                              Duration: {durationHours} hr{durationHours > 1 ? 's' : ''}
                            </div>
                          </div>

                          {isStudy && (
                            <button
                              onClick={() =>
                                onToggleSession(
                                  item.id,
                                  !item.completed,
                                  durationHours,
                                  item.dbId
                                )
                              }
                              className="btn"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                borderRadius: '6px',
                                backgroundColor: item.completed
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(255, 255, 255, 0.05)',
                                color: item.completed ? '#34d399' : 'var(--text-primary)',
                                border: item.completed
                                  ? '1px solid rgba(16, 185, 129, 0.3)'
                                  : '1px solid var(--border-color)',
                              }}
                            >
                              <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
                              {item.completed ? 'Completed' : 'Complete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section B: Weekly Priorities */}
          <div className="card">
            <div className="card-title">
              <Star className="logo-icon" size={20} />
              <h3>Weekly Priorities</h3>
            </div>
            <p style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              Top {weeklyPriorities.length} academic tasks driving your study schedule, based on priority scores.
            </p>

            {weeklyPriorities.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No active tasks. You're all caught up!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {weeklyPriorities.map((task, idx) => {
                  const percent = Math.round((task.completedHours / task.estimatedHours) * 100);

                  return (
                    <div
                      key={task.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.015)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '0.75rem',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
                              #{idx + 1}
                            </span>
                            <h4 style={{ color: '#fff', fontSize: '0.95rem' }}>{task.title}</h4>
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              marginTop: '0.25rem',
                            }}
                          >
                            Deadline: {task.deadline} • Score: {task.score}
                          </div>
                        </div>
                        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                      </div>

                      <div className="progress-info" style={{ marginBottom: '0.35rem' }}>
                        <span>Completed: {task.completedHours} / {task.estimatedHours} hrs</span>
                        <span>{percent}%</span>
                      </div>
                      <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upcoming Deadlines list */}
        <div className="dashboard-panel-right">
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">
              <Bookmark className="logo-icon" size={20} />
              <h3>Upcoming Deadlines</h3>
            </div>
            <p style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              Deadlines sorted by date order to keep you on track.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                overflowY: 'auto',
                flexGrow: 1,
              }}
            >
              {upcomingDeadlines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                  No deadlines upcoming!
                </div>
              ) : (
                upcomingDeadlines.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      transition: 'border-color var(--transition-fast)',
                    }}
                    className="deadline-item-hover"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 550, color: '#fff', fontSize: '0.875rem' }}>
                        {task.title}
                      </span>
                      <span className={`badge ${getUrgencyClass(task.deadline)}`}>
                        {getUrgencyLabel(task.deadline)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>Remaining: {task.remainingHours} hrs</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        Priority: <span style={{ textTransform: 'capitalize', fontWeight: 650 }}>{task.priority}</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => setView('tasks')}
              style={{ width: '100%', marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
            >
              <span>Manage Tasks</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* Fade-in Animation utility styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
};
