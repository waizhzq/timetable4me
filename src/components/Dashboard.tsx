import React, { useState, useEffect, useRef } from 'react';
import type { Task, FixedEvent, StudySession } from '../services/db';
import { calculatePriorityScore } from '../services/scheduler';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Bookmark,
  Star,
  FileText,
  CheckSquare,
  Square,
  AlertCircle,
  ArrowRight,
  ListTodo,
  Trash2,
  BarChart2,
  Timer,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

interface TodoItem { id: string; text: string; done: boolean; }

interface DashboardProps {
  tasks: Task[];
  events: FixedEvent[];
  sessions: StudySession[];
  onToggleSession: (sessionId: string, completed: boolean, hours: number, taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onUpdateEvent: (eventId: string, updates: Partial<FixedEvent>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onOpenManager: () => void;
  onOpenSchedule: () => void;
}

const POMODORO_WORK = 25 * 60;
const POMODORO_BREAK = 5 * 60;

export const Dashboard: React.FC<DashboardProps> = ({
  tasks, events, sessions,
  onToggleSession, onUpdateTask, onDeleteTask, onUpdateEvent, onDeleteEvent,
  onOpenManager, onOpenSchedule,
}) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayDayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];

  // ── Inspector state ────────────────────────────────────────────────────────
  const [selectedBlock, setSelectedBlock] = useState<{
    type: 'study' | 'fixed'; id: string; dbId: string; title: string;
    category: string; start: string; end: string; completed: boolean;
  } | null>(null);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // ── Quick To-Do ────────────────────────────────────────────────────────────
  const todoKey = `t4m_todos_${todayStr}`;
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(todoKey) || '[]'); } catch { return []; }
  });
  const [newTodo, setNewTodo] = useState('');

  useEffect(() => {
    localStorage.setItem(todoKey, JSON.stringify(todos));
  }, [todos, todoKey]);

  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    setTodos(prev => [...prev, { id: `td-${Date.now()}`, text: newTodo.trim(), done: false }]);
    setNewTodo('');
  };
  const toggleTodo = (id: string) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTodo = (id: string) =>
    setTodos(prev => prev.filter(t => t.id !== id));
  const clearDone = () =>
    setTodos(prev => prev.filter(t => !t.done));

  // ── Pomodoro timer ─────────────────────────────────────────────────────────
  const [pomMode, setPomMode] = useState<'work' | 'break'>('work');
  const [pomSecs, setPomSecs] = useState(POMODORO_WORK);
  const [pomRunning, setPomRunning] = useState(false);
  const pomRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pomRunning) {
      pomRef.current = setInterval(() => {
        setPomSecs(s => {
          if (s <= 1) {
            clearInterval(pomRef.current!);
            setPomRunning(false);
            const next = pomMode === 'work' ? 'break' : 'work';
            setPomMode(next);
            setPomSecs(next === 'work' ? POMODORO_WORK : POMODORO_BREAK);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (pomRef.current) clearInterval(pomRef.current);
    }
    return () => { if (pomRef.current) clearInterval(pomRef.current); };
  }, [pomRunning, pomMode]);

  const resetPomodoro = () => {
    setPomRunning(false);
    setPomMode('work');
    setPomSecs(POMODORO_WORK);
  };

  const pomMins = String(Math.floor(pomSecs / 60)).padStart(2, '0');
  const pomSecStr = String(pomSecs % 60).padStart(2, '0');
  const pomPct = pomMode === 'work'
    ? ((POMODORO_WORK - pomSecs) / POMODORO_WORK) * 100
    : ((POMODORO_BREAK - pomSecs) / POMODORO_BREAK) * 100;

  // ── Derived schedule data ──────────────────────────────────────────────────
  const activeTasks = tasks
    .filter(t => t.status !== 'completed' && t.completedHours < t.estimatedHours)
    .map(t => ({ ...t, score: calculatePriorityScore(t, now), remainingHours: Math.max(0, t.estimatedHours - t.completedHours) }))
    .sort((a, b) => b.score - a.score);

  const upcomingDeadlines = [...activeTasks].filter(t => t.hasDeadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const todayTimeline = [
    ...events.filter(e => e.recurring ? e.day === todayDayName : e.date === todayStr).map(e => ({
      id: e.id, dbId: e.id, title: e.title, type: 'fixed' as const, color: e.color,
      category: e.type, start: new Date(`${todayStr}T${e.startTime}`).toISOString(),
      end: new Date(`${todayStr}T${e.endTime}`).toISOString(), completed: false,
    })),
    ...sessions.filter(s => s.start.startsWith(todayStr)).map(s => {
      const task = tasks.find(t => t.id === s.taskId);
      return { id: s.id, dbId: s.taskId, title: s.taskTitle, type: 'study' as const,
        color: task?.color || '#FF0052', category: task?.category || 'Task',
        start: s.start, end: s.end, completed: s.completed };
    }),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const todayStudySessions = todayTimeline.filter(i => i.type === 'study');
  const completedToday = todayStudySessions.filter(i => i.completed).length;
  const totalToday = todayStudySessions.length;
  const progressPct = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

  const nextItem = todayTimeline.find(i => new Date(i.start) > now && !i.completed);
  const nextMins = nextItem ? Math.ceil((new Date(nextItem.start).getTime() - now.getTime()) / 60000) : null;
  const nextLabel = nextItem
    ? nextMins! <= 0 ? 'Starting now' : nextMins! < 60 ? `in ${nextMins}m` : `in ${Math.round(nextMins! / 60)}h`
    : totalToday > 0 ? 'All done' : '—';

  const overdueTasks = tasks.filter(t => t.status !== 'completed' && t.hasDeadline && t.deadline && t.deadline < todayStr);

  // ── Weekly stats ───────────────────────────────────────────────────────────
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekSessions = sessions.filter(s => new Date(s.start) >= weekStart);
  const weekDone = weekSessions.filter(s => s.completed);
  const weekHours = weekDone.reduce((sum, s) =>
    sum + (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3600000, 0);
  const weekRate = weekSessions.length > 0 ? Math.round((weekDone.length / weekSessions.length) * 100) : 0;
  const weekTasksDone = tasks.filter(t => t.status === 'completed').length;

  // ── Inspector derived ──────────────────────────────────────────────────────
  let inspectorDetails: any = null;
  if (selectedBlock) {
    if (selectedBlock.type === 'fixed') {
      const ev = events.find(e => e.id === selectedBlock.dbId);
      if (ev) inspectorDetails = {
        title: ev.title, type: 'fixed', category: ev.type,
        timeRange: `${ev.recurring ? ev.day : formatDateDDMMYY(ev.date)} • ${ev.startTime} - ${ev.endTime}`,
        notes: ev.notes || 'No notes added.', subtasks: [], color: ev.color,
      };
    } else {
      const sess = sessions.find(s => s.id === selectedBlock.id);
      const task = tasks.find(t => t.id === selectedBlock.dbId);
      if (sess && task) {
        const s = new Date(sess.start), e = new Date(sess.end);
        const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
        inspectorDetails = {
          title: task.title, type: 'study', category: task.category,
          timeRange: `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${s.toLocaleTimeString([], opts)} - ${e.toLocaleTimeString([], opts)}`,
          priority: task.priority, deadline: task.hasDeadline ? formatDateDDMMYY(task.deadline) : 'No Deadline',
          notes: task.notes || 'No notes added.', subtasks: task.subtasks || [], color: task.color,
        };
      }
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function formatDateDDMMYY(dateStr?: string) {
    if (!dateStr) return 'No Date';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.slice(-2)}`;
  }
  const getPriorityEmoji = (p: string) => p === 'high' ? '🔥' : p === 'medium' ? '💓' : '🛌';
  const getCategoryEmoji = (cat: string) => {
    switch (cat) {
      case 'assignment': return '📝'; case 'quiz': return '❓';
      case 'program': return '💻'; case 'date': return '📅';
      case 'training': return '💪'; default: return '•';
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    if (!selectedBlock || selectedBlock.type !== 'study') return;
    const t = tasks.find(t => t.id === selectedBlock.dbId);
    if (!t) return;
    await onUpdateTask(t.id, { subtasks: (t.subtasks || []).map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st) });
  };
  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskText.trim() || !selectedBlock || selectedBlock.type !== 'study') return;
    const t = tasks.find(t => t.id === selectedBlock.dbId);
    if (!t) return;
    await onUpdateTask(t.id, { subtasks: [...(t.subtasks || []), { id: `sub-${Date.now()}`, text: newSubtaskText.trim(), completed: false }] });
    setNewSubtaskText('');
  };
  const handleSaveNotes = async () => {
    if (!selectedBlock) return;
    if (selectedBlock.type === 'study') await onUpdateTask(selectedBlock.dbId, { notes: noteText });
    else await onUpdateEvent(selectedBlock.dbId, { notes: noteText });
    setIsEditingNotes(false);
  };
  const handleDeleteSelectedItem = async () => {
    if (!selectedBlock) return;
    if (!window.confirm(`Delete this ${selectedBlock.type === 'study' ? 'task' : 'class'}?`)) return;
    if (selectedBlock.type === 'study') await onDeleteTask(selectedBlock.dbId);
    else await onDeleteEvent(selectedBlock.dbId);
    setSelectedBlock(null);
  };
  const formatTimeRange = (a: string, b: string) => {
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fmt(new Date(a))} - ${fmt(new Date(b))}`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '100%', overflowX: 'hidden' }}>

      {/* 1. SCHEDULE QUICK LINK */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          <Calendar size={16} />
          <span>Weekly Schedule</span>
        </div>
        <button onClick={onOpenSchedule} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Open Schedule
        </button>
      </div>

      {/* 2. DAILY PROGRESS STRIP */}
      <div className="card" style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{completedToday}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>/{totalToday} sessions</span></div>
          <div style={{ marginTop: '0.4rem', height: '4px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: '2px', backgroundColor: progressPct === 100 ? '#34d399' : 'var(--primary)', transition: 'width 0.4s ease' }} />
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next up</div>
          {nextItem ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{nextItem.title}</span>
              <ArrowRight size={12} color="var(--text-muted)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{nextLabel}</span>
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{nextLabel}</span>
          )}
        </div>
        <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overdue</div>
          {overdueTasks.length === 0
            ? <span style={{ fontSize: '0.85rem', color: '#34d399' }}>None</span>
            : <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={14} color="#f87171" />
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f87171' }}>{overdueTasks.length}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>task{overdueTasks.length !== 1 ? 's' : ''}</span>
              </div>
          }
        </div>
      </div>

      {/* 3. INSPECTOR */}
      {selectedBlock && inspectorDetails && (
        <div className="card" style={{ border: `1.5px solid ${inspectorDetails.color}` }}>
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
                <button onClick={() => { if (isEditingNotes) handleSaveNotes(); else { setNoteText(inspectorDetails?.notes || ''); setIsEditingNotes(true); } }} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem' }}>{isEditingNotes ? 'Save' : 'Edit'}</button>
              </div>
              {isEditingNotes
                ? <textarea className="form-control" style={{ width: '100%', minHeight: '80px', fontSize: '0.9rem' }} value={noteText} onChange={e => setNoteText(e.target.value)} />
                : <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{inspectorDetails.notes}</div>
              }
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={() => onOpenManager()} className="btn btn-primary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}>Edit Details</button>
              <button onClick={handleDeleteSelectedItem} className="btn btn-danger" style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}>Delete Item</button>
            </div>
            {selectedBlock.type === 'study' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}><CheckSquare size={16} /><span>Checklist</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {inspectorDetails.subtasks.map((st: any) => (
                    <div key={st.id} onClick={() => handleToggleSubtask(st.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', cursor: 'pointer', padding: '4px' }}>
                      {st.completed ? <CheckSquare size={18} color="var(--success)" /> : <Square size={18} color="var(--text-muted)" />}
                      <span style={{ textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : '#fff' }}>{st.text}</span>
                    </div>
                  ))}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input type="text" className="form-control" placeholder="Add sub-task..." value={newSubtaskText} onChange={e => setNewSubtaskText(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }} />
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Add</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. TODAY'S SCHEDULE */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock className="logo-icon" size={20} />
            <h3>Today's Schedule</h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{todayDayName}</span>
        </div>
        {todayTimeline.length === 0
          ? <p style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nothing scheduled today.</p>
          : <div className="timeline">
              {todayTimeline.map(item => {
                const isStudy = item.type === 'study';
                const duration = (new Date(item.end).getTime() - new Date(item.start).getTime()) / 3600000;
                return (
                  <div key={item.id} className="timeline-item" style={{ gap: '1rem' }}>
                    <div className="timeline-time" style={{ width: '80px', fontSize: '0.8rem' }}>{formatTimeRange(item.start, item.end)}</div>
                    <div className="timeline-marker"><div className="timeline-dot" style={{ backgroundColor: item.color }} /><div className="timeline-line" /></div>
                    <div className="timeline-content">
                      <div className="timeline-card" style={{ borderLeft: `4px solid ${item.color}`, padding: '0.75rem 1rem' }}>
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
        }
      </div>

      {/* 5. TASKS & DEADLINES */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title"><Star size={20} className="logo-icon" /><h3>Priorities</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activeTasks.length === 0
              ? <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No active tasks.</p>
              : activeTasks.slice(0, 3).map(task => (
                  <div key={task.id} style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.015)', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: `3px solid ${task.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{getCategoryEmoji(task.category)} {task.title}</span>
                      <span style={{ fontSize: '1rem' }}>{getPriorityEmoji(task.priority)}</span>
                    </div>
                    <div className="progress-container" style={{ height: '5px' }}><div className="progress-bar" style={{ width: `${(task.completedHours / task.estimatedHours) * 100}%`, backgroundColor: task.color }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '6px', color: 'var(--text-secondary)' }}>
                      <span>{task.completedHours}/{task.estimatedHours}h</span>
                      <span>{task.hasDeadline ? formatDateDDMMYY(task.deadline) : 'No Deadline'}</span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Bookmark size={20} className="logo-icon" /><h3>Deadlines</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {overdueTasks.length > 0 && (
              <>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertCircle size={11} /> Overdue
                </div>
                {overdueTasks.map(task => (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0.6rem', borderRadius: '6px', backgroundColor: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.15)' }}>
                    <span style={{ color: '#fca5a5' }}>{getCategoryEmoji(task.category)} {task.title}</span>
                    <span style={{ color: '#f87171', fontWeight: 700 }}>{formatDateDDMMYY(task.deadline)}</span>
                  </div>
                ))}
                {upcomingDeadlines.length > 0 && <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }} />}
              </>
            )}
            {upcomingDeadlines.length === 0 && overdueTasks.length === 0
              ? <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No upcoming deadlines.</p>
              : upcomingDeadlines.slice(0, 5).map(task => (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: '#fff' }}>{getCategoryEmoji(task.category)} {task.title}</span>
                    <span style={{ color: task.color, fontWeight: 700 }}>{formatDateDDMMYY(task.deadline)}</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* 6. WEEKLY STATS + POMODORO */}
      <div className="dashboard-grid">

        {/* Weekly Stats */}
        <div className="card">
          <div className="card-title"><BarChart2 size={20} className="logo-icon" /><h3>This Week</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
              { label: 'Sessions done', value: `${weekDone.length}/${weekSessions.length}` },
              { label: 'Hours studied', value: `${weekHours.toFixed(1)}h` },
              { label: 'Completion rate', value: `${weekRate}%` },
              { label: 'Tasks finished', value: `${weekTasksDone}` },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{stat.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pomodoro Timer */}
        <div className="card">
          <div className="card-title"><Timer size={20} className="logo-icon" /><h3>Focus Timer</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '0.5rem' }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['work', 'break'] as const).map(mode => (
                <button key={mode} onClick={() => { setPomMode(mode); setPomRunning(false); setPomSecs(mode === 'work' ? POMODORO_WORK : POMODORO_BREAK); }}
                  className="btn" style={{ padding: '4px 14px', fontSize: '0.75rem', backgroundColor: pomMode === mode ? 'var(--primary)' : 'transparent', border: `1px solid ${pomMode === mode ? 'var(--primary)' : 'var(--border-color)'}`, color: pomMode === mode ? '#fff' : 'var(--text-secondary)' }}>
                  {mode === 'work' ? 'Focus' : 'Break'}
                </button>
              ))}
            </div>

            {/* Ring + time */}
            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
              <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="none"
                  stroke={pomMode === 'work' ? 'var(--primary)' : '#34d399'}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - pomPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{pomMins}:{pomSecStr}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setPomRunning(r => !r)} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {pomRunning ? <Pause size={15} /> : <Play size={15} />}
                {pomRunning ? 'Pause' : 'Start'}
              </button>
              <button onClick={resetPomodoro} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
                <RotateCcw size={15} />
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {pomMode === 'work' ? '25 min focus block' : '5 min break'}
            </p>
          </div>
        </div>
      </div>

      {/* 7. QUICK TO-DO */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListTodo size={20} className="logo-icon" />
            <h3>Quick To-Do</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{todos.filter(t => t.done).length}/{todos.length} done</span>
            {todos.some(t => t.done) && (
              <button onClick={clearDone} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>Clear done</button>
            )}
          </div>
        </div>

        <form onSubmit={addTodo} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Add a to-do for today..."
            value={newTodo}
            onChange={e => setNewTodo(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Add</button>
        </form>

        {todos.length === 0
          ? <p style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nothing here yet.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {todos.map(todo => (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '8px', backgroundColor: todo.done ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.025)', border: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                  <button onClick={() => toggleTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: todo.done ? '#34d399' : 'var(--text-muted)', display: 'flex' }}>
                    {todo.done ? <CheckCircle2 size={18} /> : <Square size={18} />}
                  </button>
                  <span style={{ flex: 1, fontSize: '0.9rem', color: todo.done ? 'var(--text-muted)' : '#fff', textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.text}</span>
                  <button onClick={() => deleteTodo(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex', opacity: 0.5 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
        }
      </div>

    </div>
  );
};
