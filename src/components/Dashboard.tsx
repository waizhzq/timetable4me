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
  const formatDateDDMMYY = (dateStr?: string) => {
    if (!dateStr) return 'No Date';
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
  const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(sundayDate.getTime());
    d.setDate(sundayDate.getDate() + i);
    return d;
  });

  // ----------------------------------------------------
  // Dynamic Hour Range Calculation
  // ----------------------------------------------------
  const timeToDecimal = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };

  let minHour = 8;
  let maxHour = 18;

  events.forEach(e => {
    const start = Math.floor(timeToDecimal(e.startTime));
    const end = Math.ceil(timeToDecimal(e.endTime));
    if (start < minHour) minHour = start;
    if (end > maxHour) maxHour = end;
  });

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
  // Helpers
  // ----------------------------------------------------
  const getPriorityEmoji = (p: string) => {
    if (p === 'high') return '🔥';
    if (p === 'medium') return '💓';
    return '🛌';
  };

  const getCategoryEmoji = (cat: string) => {
    switch (cat) {
      case 'assignment': return '📝';
      case 'quiz': return '❓';
      case 'program': return '💻';
      case 'date': return '📅';
      case 'training': return '💪';
      default: return '✨';
    }
  };

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
    color: string;
  } | null = null;

  if (selectedBlock) {
    if (selectedBlock.type === 'fixed') {
      const matchedEvent = events.find((e) => e.id === selectedBlock.dbId);
      if (matchedEvent) {
        inspectorDetails = {
          title: matchedEvent.title,
          type: 'fixed',
          category: matchedEvent.type,
          timeRange: `${matchedEvent.recurring ? matchedEvent.day : formatDateDDMMYY(matchedEvent.date)} • ${matchedEvent.startTime} - ${matchedEvent.endTime}`,
          notes: matchedEvent.notes || 'No notes added.',
          subtasks: [],
          color: matchedEvent.color,
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

        const isOverdue = matchedTask.hasDeadline && matchedTask.deadline && new Date(matchedTask.deadline + 'T23:59:59').getTime() < now.getTime() && matchedTask.status !== 'completed';

        inspectorDetails = {
          title: matchedTask.title,
          type: 'study',
          category: matchedTask.category === 'other' ? matchedTask.customCategory || 'Task' : matchedTask.category,
          timeRange: timeRangeStr,
          priority: matchedTask.priority,
          deadline: matchedTask.hasDeadline ? formatDateDDMMYY(matchedTask.deadline) : 'No Deadline',
          notes: matchedTask.notes || 'No notes added.',
          subtasks: matchedTask.subtasks || [],
          isOverdue: !!isOverdue,
          color: matchedTask.color,
        };
      }
    }
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    if (!selectedBlock || selectedBlock.type !== 'study') return;
    const matchedTask = tasks.find((t) => t.id === selectedBlock.dbId);
    if (!matchedTask) return;
    const updatedSubtasks = (matchedTask.subtasks || []).map((st) => st.id === subtaskId ? { ...st, completed: !st.completed } : st);
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
    if (selectedBlock.type === 'study') await onUpdateTask(selectedBlock.dbId, { notes: noteText });
    else await onUpdateEvent(selectedBlock.dbId, { notes: noteText });
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

  const upcomingDeadlines = [...activeTasks].filter(t => t.hasDeadline).sort((a, b) => {
    return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
  });

  const todayTimeline = [
    ...events.filter(e => e.recurring ? e.day === todayDayName : e.date === todayStr).map(e => ({
      id: e.id, dbId: e.id, title: e.title, type: 'fixed' as const, color: e.color,
      category: e.type, start: new Date(todayStr + 'T' + e.startTime).toISOString(),
      end: new Date(todayStr + 'T' + e.endTime).toISOString(), completed: false,
    })),
    ...sessions.filter(s => s.start.startsWith(todayStr)).map(s => {
      const task = tasks.find(t => t.id === s.taskId);
      return {
        id: s.id, dbId: s.taskId, title: s.taskTitle, type: 'study' as const, color: task?.color || '#FF0052',
        category: task?.category || 'Task', start: s.start, end: s.end, completed: s.completed,
      };
    })
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const formatTimeRange = (startISO: string, endISO: string) => {
    const s = new Date(startISO);
    const e = new Date(endISO);
    return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '100%', overflowX: 'hidden' }}>
      
      {/* 1. WEEKLY SCHEDULE */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar className="logo-icon" size={20} />
            <h3>Weekly Timetable</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {formatDateDDMMYY(weekDates[0].toISOString().split('T')[0])} - {formatDateDDMMYY(weekDates[6].toISOString().split('T')[0])}
          </span>
        </div>

        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, minmax(110px, 1fr))', border: '1px solid var(--border-color)', borderRadius: '10px', minWidth: '800px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }} />
            {weekDates.map((date, idx) => {
              const isToday = date.toDateString() === now.toDateString();
              return (
                <div key={idx} style={{ padding: '10px 4px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', borderRight: idx === 6 ? 'none' : '1px solid var(--border-color)', backgroundColor: isToday ? 'var(--primary-glow)' : 'transparent' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isToday ? 'var(--primary)' : '#fff' }}>{DAYS_SHORT[idx]}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{date.getDate()}</div>
                </div>
              );
            })}

            {hours.map((hour) => (
              <React.Fragment key={hour}>
                <div style={{ padding: '6px 4px', textAlign: 'right', fontSize: '0.65rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{hour}:00</div>
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
                            position: 'absolute', top: '1px', left: '1px', right: '1px', zIndex: 10, borderRadius: '4px', padding: '2px 4px', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', overflow: 'hidden', height: `${(timeToDecimal(matchedFixed.endTime) - timeToDecimal(matchedFixed.startTime)) * 42 - 2}px`,
                            backgroundColor: `${matchedFixed.color}33`, border: `1px solid ${matchedFixed.color}`, color: matchedFixed.color
                          }}
                        >
                          {matchedFixed.title}
                        </div>
                      )}
                      {matchedStudy && (
                        <div
                          onClick={() => setSelectedBlock({ type: 'study', id: matchedStudy.id, dbId: matchedStudy.taskId, title: matchedStudy.taskTitle, category: 'study block', start: matchedStudy.start, end: matchedStudy.end, completed: matchedStudy.completed })}
                          style={{
                            position: 'absolute', top: '1px', left: '1px', right: '1px', zIndex: 10, borderRadius: '4px', padding: '2px 4px', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', overflow: 'hidden', height: `${(new Date(matchedStudy.end).getHours() - new Date(matchedStudy.start).getHours()) * 42 - 2}px`,
                            backgroundColor: matchedStudy.completed ? 'rgba(16, 185, 129, 0.1)' : `${(tasks.find(t => t.id === matchedStudy.taskId)?.color || '#FF0052')}22`,
                            border: matchedStudy.completed ? '1px solid #10b981' : `1px dashed ${tasks.find(t => t.id === matchedStudy.taskId)?.color || 'var(--primary)'}`,
                            color: matchedStudy.completed ? '#a7f3d0' : (tasks.find(t => t.id === matchedStudy.taskId)?.color || '#ffcdcd'),
                            textDecoration: matchedStudy.completed ? 'line-through' : 'none'
                          }}
                        >
                          {getCategoryEmoji(tasks.find(t => t.id === matchedStudy.taskId)?.category || 'other')} {matchedStudy.taskTitle}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <button onClick={() => setShowManager(true)} className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem', padding: '1rem', display: 'flex', gap: '0.6rem', fontWeight: 700, fontSize: '1rem' }}>
          <PlusCircle size={20} /><span>Manage Tasks & Classes</span>
        </button>
      </div>

      {/* 2. INSPECTOR */}
      {selectedBlock && inspectorDetails && (
        <div className="card" style={{ border: `1.5px solid ${inspectorDetails.color}`, animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700, backgroundColor: `${inspectorDetails.color}22`, color: inspectorDetails.color }}>{inspectorDetails.category}</span>
              <h3 style={{ margin: '6px 0 0', color: '#fff', fontSize: '1.2rem' }}>{inspectorDetails.title} {inspectorDetails.priority && getPriorityEmoji(inspectorDetails.priority)}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
                <Clock size={14} /><span>{inspectorDetails.timeRange}</span>
              </div>
            </div>
            <button onClick={() => setSelectedBlock(null)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Close</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}><FileText size={16} /><span>Notes</span></div>
                <button onClick={() => { if(isEditingNotes) handleSaveNotes(); else { setNoteText(inspectorDetails?.notes || ''); setIsEditingNotes(true); } }} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }}>{isEditingNotes ? 'Save' : 'Edit'}</button>
              </div>
              {isEditingNotes ? <textarea className="form-control" style={{ width: '100%', minHeight: '80px', fontSize: '0.9rem' }} value={noteText} onChange={(e) => setNoteText(e.target.value)} /> : <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{inspectorDetails.notes}</div>}
            </div>
            {selectedBlock.type === 'study' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}><CheckSquare size={16} /><span>Checklist</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {inspectorDetails.subtasks.map(st => (
                    <div key={st.id} onClick={() => handleToggleSubtask(st.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', cursor: 'pointer', padding: '4px' }}>
                      {st.completed ? <CheckSquare size={18} color="var(--success)" /> : <Square size={18} color="var(--text-muted)" />}
                      <span style={{ textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : '#fff' }}>{st.text}</span>
                    </div>
                  ))}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input type="text" className="form-control" placeholder="Add sub-task..." value={newSubtaskText} onChange={(e) => setNewSubtaskText(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }} />
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Add</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TODAY'S TIMELINE */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock className="logo-icon" size={20} />
            <h3>Today's Schedule</h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{todayDayName}</span>
        </div>

        {todayTimeline.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>✨ Your schedule is clear for today!</p>
        ) : (
          <div className="timeline">
            {todayTimeline.map((item) => {
              const isStudy = item.type === 'study';
              const duration = (new Date(item.end).getTime() - new Date(item.start).getTime()) / (1000 * 60 * 60);
              return (
                <div key={item.id} className="timeline-item" style={{ gap: '1rem' }}>
                  <div className="timeline-time" style={{ width: '80px', fontSize: '0.8rem' }}>{formatTimeRange(item.start, item.end)}</div>
                  <div className="timeline-marker"><div className={`timeline-dot`} style={{ backgroundColor: item.color }} /><div className="timeline-line" /></div>
                  <div className="timeline-content">
                    <div className={`timeline-card`} style={{ borderLeft: `4px solid ${item.color}`, padding: '0.75rem 1rem' }}>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedBlock({ type: item.type, id: item.id, dbId: item.dbId, title: item.title, category: isStudy ? 'study block' : 'fixed commitment', start: item.start, end: item.end, completed: item.completed })}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{getCategoryEmoji(item.category)} {item.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{duration.toFixed(1)} hr{duration !== 1 ? 's' : ''} • {item.category}</div>
                      </div>
                      {isStudy && (
                        <button onClick={() => onToggleSession(item.id, !item.completed, duration, item.dbId)} className="btn" style={{ padding: '6px 12px', fontSize: '0.75rem', backgroundColor: item.completed ? 'rgba(16,185,129,0.1)' : 'transparent', border: '1px solid var(--border-color)', color: item.completed ? 'var(--success)' : '#fff' }}>
                          <CheckCircle2 size={14} />
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

      {/* 4. TASKS & DEADLINES */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title"><Star size={20} className="logo-icon" /><h3>Priorities</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activeTasks.slice(0, 3).map(task => (
              <div key={task.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.015)', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: `3px solid ${task.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{getCategoryEmoji(task.category)} {task.title}</span>
                  <span style={{ fontSize: '1rem' }}>{getPriorityEmoji(task.priority)}</span>
                </div>
                <div className="progress-container" style={{ height: '5px' }}><div className="progress-bar" style={{ width: `${(task.completedHours/task.estimatedHours)*100}%`, backgroundColor: task.color }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '6px', color: 'var(--text-secondary)' }}>
                  <span>{task.completedHours}/{task.estimatedHours}h</span>
                  <span>{task.hasDeadline ? formatDateDDMMYY(task.deadline) : 'No Deadline'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Bookmark size={20} className="logo-icon" /><h3>Deadlines</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcomingDeadlines.length === 0 ? <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No upcoming deadlines.</p> : upcomingDeadlines.slice(0, 5).map(task => (
              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: '#fff' }}>{getCategoryEmoji(task.category)} {task.title}</span>
                <span style={{ color: task.color, fontWeight: 700 }}>{formatDateDDMMYY(task.deadline)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
    </div>
  );
};
