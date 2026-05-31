import React, { useState } from 'react';
import type { Task, FixedEvent, StudySession, UserPreferences } from '../services/db';
import { calculatePriorityScore } from '../services/scheduler';
import { ScheduleManager } from './ScheduleManager';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Bookmark,
  Star,
  FileText,
  CheckSquare,
  Square,
  PlusCircle
} from 'lucide-react';

interface DashboardProps {
  tasks: Task[];
  events: FixedEvent[];
  sessions: StudySession[];
  preferences: UserPreferences;
  conflictedTaskIds: string[];
  onToggleSession: (
    sessionId: string,
    completed: boolean,
    hours: number,
    taskId: string
  ) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddTask: (task: Omit<Task, 'id'>) => Promise<void>;
  onAddEvent: (event: Omit<FixedEvent, 'id'>) => Promise<void>;
  onUpdateEvent: (eventId: string, updates: Partial<FixedEvent>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onSavePreferences: (newPrefs: UserPreferences) => Promise<void>;
  onResetData: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  events,
  sessions,
  preferences,
  conflictedTaskIds,
  onToggleSession,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onSavePreferences,
  onResetData,
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

  // State for Management Modal
  const [showManager, setShowManager] = useState(false);

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
  // Date Helpers
  // ----------------------------------------------------
  const formatDateDDMMYY = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.slice(-2)}`;
  };

  const getSunday = (d: Date): Date => {
    const date = new Date(d.getTime());
    const day = date.getDay();
    const diff = date.getDate() - day;
    const sunday = new Date(date.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  };

  const sundayDate = getSunday(now);
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(sundayDate.getTime());
    d.setDate(sundayDate.getDate() + i);
    return d;
  });

  // ----------------------------------------------------
  // Dynamic Hour Range Calculation (Default 8-18)
  // ----------------------------------------------------
  const timeToDecimal = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };

  let minHour = 8;
  let maxHour = 18;

  // Check this week's fixed events
  events.forEach(e => {
    const start = Math.floor(timeToDecimal(e.startTime));
    const end = Math.ceil(timeToDecimal(e.endTime));
    if (start < minHour) minHour = start;
    if (end > maxHour) maxHour = end;
  });

  // Check this week's study sessions
  sessions.forEach(s => {
    const sDate = s.start.split('T')[0];
    const isThisWeek = weekDates.some(d => d.toISOString().split('T')[0] === sDate);
    if (isThisWeek) {
      const start = new Date(s.start).getHours();
      const end = Math.ceil(new Date(s.end).getHours() + new Date(s.end).getMinutes() / 60);
      if (start < minHour) minHour = start;
      if (end > maxHour) maxHour = end;
    }
  });

  const hours = Array.from({ length: maxHour - minHour }).map((_, i) => minHour + i);

  // ----------------------------------------------------
  // Inspector Details
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
          timeRange: `${matchedEvent.recurring ? matchedEvent.day : formatDateDDMMYY(matchedEvent.date || '')} • ${matchedEvent.startTime} - ${matchedEvent.endTime}`,
          notes: matchedEvent.notes || 'No notes added.',
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
          deadline: formatDateDDMMYY(matchedTask.deadline),
          notes: matchedTask.notes || 'No notes added.',
          subtasks: matchedTask.subtasks || [],
          isOverdue,
        };
      }
    }
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    if (!selectedBlock || selectedBlock.type !== 'study') return;
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

    const newSub = { id: `sub-${Date.now()}`, text: newSubtaskText.trim(), completed: false };
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

  const todayTimeline = [
    ...events.filter(e => e.recurring ? e.day === todayDayName : e.date === todayStr).map(e => ({
      id: e.id, dbId: e.id, title: e.title, type: 'fixed' as const, eventType: e.type,
      start: new Date(todayStr + 'T' + e.startTime).toISOString(),
      end: new Date(todayStr + 'T' + e.endTime).toISOString(),
      completed: false,
    })),
    ...sessions.filter(s => s.start.startsWith(todayStr)).map(s => ({
      id: s.id, dbId: s.taskId, title: s.taskTitle, type: 'study' as const, eventType: 'study',
      start: s.start, end: s.end, completed: s.completed,
    }))
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const formatTimeRange = (startISO: string, endISO: string) => {
    const s = new Date(startISO);
    const e = new Date(endISO);
    return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '100%', overflowX: 'hidden' }}>
      
      {/* ----------------------------------------------------
          1. WEEKLY SQUARE TIMETABLE
          ---------------------------------------------------- */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar className="logo-icon" size={20} />
            <h3>Weekly Schedule</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {formatDateDDMMYY(weekDates[0].toISOString().split('T')[0])} - {formatDateDDMMYY(weekDates[6].toISOString().split('T')[0])}
          </span>
        </div>

        {/* Timetable Scroll Container */}
        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '50px repeat(7, minmax(100px, 1fr))',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              minWidth: '700px', // Ensures it doesn't crush on iPhone 12
              backgroundColor: 'rgba(0,0,0,0.1)',
            }}
          >
            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }} />
            {weekDates.map((date, idx) => {
              const isToday = date.toDateString() === now.toDateString();
              return (
                <div key={idx} style={{ padding: '8px 4px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', borderRight: idx === 6 ? 'none' : '1px solid var(--border-color)', backgroundColor: isToday ? 'var(--primary-glow)' : 'transparent' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isToday ? 'var(--primary)' : '#fff' }}>{DAYS_SHORT[idx]}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{date.getDate()}</div>
                </div>
              );
            })}

            {/* Rows */}
            {hours.map((hour) => (
              <React.Fragment key={hour}>
                <div style={{ padding: '6px 4px', textAlign: 'right', fontSize: '0.6rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {hour}:00
                </div>
                {weekDates.map((date, dayIdx) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const dayName = DAYS_FULL[date.getDay()];

                  const matchedFixed = events.find(e => {
                    const startDec = timeToDecimal(e.startTime);
                    return (e.recurring ? e.day === dayName : e.date === dateStr) && Math.floor(startDec) === hour;
                  });

                  const matchedStudy = sessions.find(s => {
                    if (!s.start.startsWith(dateStr)) return false;
                    return new Date(s.start).getHours() === hour;
                  });

                  const isCovered = events.some(e => {
                    if (!(e.recurring ? e.day === dayName : e.date === dateStr)) return false;
                    return hour > Math.floor(timeToDecimal(e.startTime)) && hour < timeToDecimal(e.endTime);
                  }) || sessions.some(s => {
                    if (!s.start.startsWith(dateStr)) return false;
                    return hour > new Date(s.start).getHours() && hour < new Date(s.end).getHours();
                  });

                  if (isCovered) return <div key={dayIdx} style={{ borderBottom: '1px solid var(--border-color)', borderRight: dayIdx === 6 ? 'none' : '1px solid var(--border-color)' }} />;

                  return (
                    <div key={dayIdx} style={{ borderBottom: '1px solid var(--border-color)', borderRight: dayIdx === 6 ? 'none' : '1px solid var(--border-color)', position: 'relative' }}>
                      {matchedFixed && (
                        <div
                          onClick={() => setSelectedBlock({ type: 'fixed', id: matchedFixed.id, dbId: matchedFixed.id, title: matchedFixed.title, category: matchedFixed.type, start: matchedFixed.startTime, end: matchedFixed.endTime, completed: false })}
                          style={{
                            position: 'absolute', top: '1px', left: '1px', right: '1px', zIndex: 10, borderRadius: '4px', padding: '2px 4px', fontSize: '0.55rem', fontWeight: 600, cursor: 'pointer', overflow: 'hidden', height: `${(timeToDecimal(matchedFixed.endTime) - timeToDecimal(matchedFixed.startTime)) * 40 - 2}px`,
                            backgroundColor: matchedFixed.type === 'training' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                            border: `1px solid ${matchedFixed.type === 'training' ? '#fbbf24' : '#60a5fa'}`, color: matchedFixed.type === 'training' ? '#fde047' : '#93c5fd'
                          }}
                        >
                          {matchedFixed.title}
                        </div>
                      )}
                      {matchedStudy && (
                        <div
                          onClick={() => setSelectedBlock({ type: 'study', id: matchedStudy.id, dbId: matchedStudy.taskId, title: matchedStudy.taskTitle, category: 'study block', start: matchedStudy.start, end: matchedStudy.end, completed: matchedStudy.completed })}
                          style={{
                            position: 'absolute', top: '1px', left: '1px', right: '1px', zIndex: 10, borderRadius: '4px', padding: '2px 4px', fontSize: '0.55rem', fontWeight: 600, cursor: 'pointer', overflow: 'hidden', height: `${(new Date(matchedStudy.end).getHours() - new Date(matchedStudy.start).getHours()) * 40 - 2}px`,
                            backgroundColor: matchedStudy.completed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 84, 85, 0.15)',
                            border: `1px dashed ${matchedStudy.completed ? '#10b981' : 'var(--primary)'}`, color: matchedStudy.completed ? '#a7f3d0' : '#ffcdcd',
                            textDecoration: matchedStudy.completed ? 'line-through' : 'none'
                          }}
                        >
                          📖 {matchedStudy.taskTitle}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Unified Manage Button */}
        <button
          onClick={() => setShowManager(true)}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1.25rem', padding: '0.85rem', display: 'flex', gap: '0.6rem', boxShadow: '0 4px 12px var(--primary-glow)' }}
        >
          <PlusCircle size={20} />
          <span style={{ fontSize: '1rem' }}>Manage Tasks & Classes</span>
        </button>
      </div>

      {/* ----------------------------------------------------
          2. INSPECTOR & MODALS
          ---------------------------------------------------- */}
      {showManager && (
        <ScheduleManager
          tasks={tasks}
          events={events}
          preferences={preferences}
          conflictedTaskIds={conflictedTaskIds}
          onAddTask={onAddTask}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onAddEvent={onAddEvent}
          onDeleteEvent={onDeleteEvent}
          onSavePreferences={onSavePreferences}
          onResetData={onResetData}
          onClose={() => setShowManager(false)}
        />
      )}

      {selectedBlock && inspectorDetails && (
        <div className="card" style={{ border: '1.5px solid var(--primary)', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--primary)' }}>{inspectorDetails.category}</span>
              <h3 style={{ margin: '4px 0 0', color: '#fff' }}>{inspectorDetails.title}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
                <Clock size={12} /><span>{inspectorDetails.timeRange}</span>
              </div>
            </div>
            <button onClick={() => setSelectedBlock(null)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Close</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}><FileText size={14} /><span>Notes</span></div>
                <button onClick={() => { if(isEditingNotes) handleSaveNotes(); else { setNoteText(inspectorDetails?.notes || ''); setIsEditingNotes(true); } }} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.65rem' }}>{isEditingNotes ? 'Save' : 'Edit'}</button>
              </div>
              {isEditingNotes ? <textarea className="form-control" style={{ width: '100%', minHeight: '60px', fontSize: '0.8rem' }} value={noteText} onChange={(e) => setNoteText(e.target.value)} /> : <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{inspectorDetails.notes}</div>}
            </div>
            {selectedBlock.type === 'study' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}><CheckSquare size={14} /><span>Checklist</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {inspectorDetails.subtasks.map(st => (
                    <div key={st.id} onClick={() => handleToggleSubtask(st.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      {st.completed ? <CheckSquare size={14} color="var(--success)" /> : <Square size={14} color="var(--text-muted)" />}
                      <span style={{ textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : '#fff' }}>{st.text}</span>
                    </div>
                  ))}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <input type="text" className="form-control" placeholder="Add sub-task..." value={newSubtaskText} onChange={(e) => setNewSubtaskText(e.target.value)} style={{ flex: 1, padding: '4px 8px', fontSize: '0.75rem' }} />
                    <button type="submit" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Add</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          3. TODAY'S TIMELINE (Mobile optimized list)
          ---------------------------------------------------- */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock className="logo-icon" size={20} />
            <h3>Today's Plan</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{todayDayName}</span>
        </div>

        {todayTimeline.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Enjoy your free day! No sessions scheduled.</p>
        ) : (
          <div className="timeline">
            {todayTimeline.map((item) => {
              const isStudy = item.type === 'study';
              const duration = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1000 * 60 * 60);
              return (
                <div key={item.id} className="timeline-item" style={{ gap: '0.75rem' }}>
                  <div className="timeline-time" style={{ width: '70px', fontSize: '0.75rem' }}>{formatTimeRange(item.start, item.end)}</div>
                  <div className="timeline-marker"><div className={`timeline-dot ${isStudy ? 'study' : 'fixed'}`} /><div className="timeline-line" /></div>
                  <div className="timeline-content">
                    <div className={`timeline-card ${isStudy ? 'study' : 'fixed'}`} style={{ padding: '0.6rem 0.8rem' }}>
                      <div onClick={() => setSelectedBlock({ type: item.type, id: item.id, dbId: item.dbId, title: item.title, category: isStudy ? 'study block' : 'fixed commitment', start: item.start, end: item.end, completed: item.completed })}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{item.title}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{duration} hr{duration > 1 ? 's' : ''} • {item.eventType}</div>
                      </div>
                      {isStudy && (
                        <button onClick={() => onToggleSession(item.id, !item.completed, duration, item.dbId)} className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem', backgroundColor: item.completed ? 'rgba(16,185,129,0.1)' : 'transparent', border: '1px solid var(--border-color)', color: item.completed ? 'var(--success)' : '#fff' }}>
                          <CheckCircle2 size={12} />
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

      {/* ----------------------------------------------------
          4. TASKS & DEADLINES (Compact)
          ---------------------------------------------------- */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title"><Star size={20} className="logo-icon" /><h3>Top Priorities</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeTasks.slice(0, 3).map(task => (
              <div key={task.id} style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>{task.title}</span>
                  <span className={`badge badge-${task.priority}`} style={{ fontSize: '0.6rem' }}>{task.priority}</span>
                </div>
                <div className="progress-container" style={{ height: '4px' }}><div className="progress-bar" style={{ width: `${(task.completedHours/task.estimatedHours)*100}%` }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  <span>{task.completedHours}/{task.estimatedHours}h</span>
                  <span>{formatDateDDMMYY(task.deadline)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Bookmark size={20} className="logo-icon" /><h3>Deadlines</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {upcomingDeadlines.slice(0, 5).map(task => (
              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: '#fff' }}>{task.title}</span>
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatDateDDMMYY(task.deadline)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

