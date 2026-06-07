import React, { useState } from 'react';
import type { Task, FixedEvent, UserPreferences } from '../services/db';
import {
  Trash2,
  Calendar,
  ListTodo,
  X,
  LayoutGrid,
  Clock,
  Timer
} from 'lucide-react';

interface ScheduleManagerProps {
  tasks: Task[];
  events: FixedEvent[];
  preferences: UserPreferences;
  conflictedTaskIds: string[];
  initialItem?: { type: 'task' | 'event', id: string } | null;
  onAddTask: (task: Omit<Task, 'id'>) => Promise<void>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddEvent: (event: Omit<FixedEvent, 'id'>) => Promise<void>;
  onUpdateEvent: (eventId: string, updates: Partial<FixedEvent>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
  onResetData: () => void;
  onClose: () => void;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  tasks,
  events,
  preferences,
  initialItem,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onSavePreferences,
  onResetData,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'events' | 'settings'>('tasks');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<Task['category']>('assignment');
  const [customCategory, setCustomCategory] = useState('');
  const [taskColor, setTaskColor] = useState('#FF0052');
  const [hasDeadline, setHasDeadline] = useState(true);
  const [taskDeadline, setTaskDeadline] = useState('');
  const [timeMode, setTimeOption] = useState<'range' | 'deadline'>('range');
  const [taskHours, setTaskHours] = useState<number>(2);
  const [taskStart, setTaskStart] = useState('09:00');
  const [taskEnd, setTaskEnd] = useState('11:00');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskNotes, setTaskNotes] = useState('');

  // Helper to format date as DD/MM/YYYY
  const fmtDate = (d?: string) => {
    if (!d) return '';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
  };

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'class' | 'training' | 'meeting' | 'work' | 'other'>('class');
  const [eventColor, setEventColor] = useState('#0055DA');
  const [eventDay, setEventDay] = useState<'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'>('Monday');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('11:00');

  // Preferences State
  const [earliest, setEarliest] = useState(preferences.earliestStudyTime);
  const [latest, setLatest] = useState(preferences.latestStudyTime);
  const [maxHours, setMaxHours] = useState(preferences.maxStudyHoursPerDay);

  const COLORS = [
    '#FF0052', '#FFD400', '#00C68D', '#0055DA', 
    '#F5F5F5', '#76ABAE', '#303841', '#FF5722', 
    '#FFC7C7', '#FFE2E2', '#F6F6F6', '#8785A2'
  ];

  // Effect to load initial item for editing
  React.useEffect(() => {
    if (initialItem) {
      if (initialItem.type === 'task') {
        const task = tasks.find(t => t.id === initialItem.id);
        if (task) {
          setActiveTab('tasks');
          setEditingId(task.id);
          setTaskTitle(task.title);
          setTaskCategory(task.category);
          setCustomCategory(task.customCategory || '');
          setTaskColor(task.color);
          setHasDeadline(task.hasDeadline);
          setTaskDeadline(task.deadline || '');
          setTimeOption(task.startTime ? 'specific' : 'hours');
          setTaskHours(task.estimatedHours);
          setTaskStart(task.startTime || '09:00');
          setTaskEnd(task.endTime || '11:00');
          setTaskPriority(task.priority);
          setTaskNotes(task.notes || '');
        }
      } else if (initialItem.type === 'event') {
        const event = events.find(e => e.id === initialItem.id);
        if (event) {
          setActiveTab('events');
          setEditingId(event.id);
          setEventTitle(event.title);
          setEventType(event.type);
          setEventColor(event.color);
          setEventDay(event.day || 'Monday');
          setEventStart(event.startTime);
          setEventEnd(event.endTime);
        }
      }
    }
  }, [initialItem, tasks, events]);

  const resetTaskForm = () => {
    setEditingId(null);
    setTaskTitle('');
    setTaskNotes('');
    setCustomCategory('');
    setTaskColor('#FF0052');
    setHasDeadline(true);
    setTaskDeadline('');
    setTaskHours(2);
    setTaskPriority('medium');
  };

  const resetEventForm = () => {
    setEditingId(null);
    setEventTitle('');
    setEventColor('#0055DA');
    setEventDay('Monday');
    setEventStart('09:00');
    setEventEnd('11:00');
  };

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    let estHours = 0.5;
    let finalStart = taskStart;
    let finalEnd = taskStart;

    if (timeMode === 'range') {
      const [sh, sm] = taskStart.split(':').map(Number);
      const [eh, em] = taskEnd.split(':').map(Number);
      estHours = (eh + em / 60) - (sh + sm / 60);
      finalEnd = taskEnd;
    }

    const taskData = {
      title: taskTitle,
      category: taskCategory,
      customCategory: taskCategory === 'other' ? customCategory : undefined,
      color: taskColor,
      hasDeadline,
      deadline: hasDeadline ? taskDeadline : undefined,
      startTime: finalStart,
      endTime: finalEnd,
      estimatedHours: Math.max(0.1, estHours),
      completedHours: 0,
      priority: taskPriority,
      status: 'pending' as const,
      notes: taskNotes.trim() || undefined,
      subtasks: [],
    };

    if (editingId) {
      await onUpdateTask(editingId, taskData);
      alert('Task updated!');
    } else {
      await onAddTask(taskData);
    }

    resetTaskForm();
  };

  const handleAddEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    const eventData = {
      title: eventTitle,
      type: eventType,
      color: eventColor,
      day: eventDay,
      startTime: eventStart,
      endTime: eventEnd,
      recurring: true,
    };

    if (editingId) {
      await onUpdateEvent(editingId, eventData);
      alert('Class updated!');
    } else {
      await onAddEvent(eventData);
    }

    resetEventForm();
  };

  const handlePrefsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSavePreferences({
      earliestStudyTime: earliest,
      latestStudyTime: latest,
      maxStudyHoursPerDay: maxHours,
    });
    alert('Preferences updated!');
  };

  const getPriorityIcon = (p: string) => {
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

  const startEditingTask = (t: Task) => {
    setEditingId(t.id);
    setTaskTitle(t.title);
    setTaskCategory(t.category);
    setCustomCategory(t.customCategory || '');
    setTaskColor(t.color);
    setHasDeadline(t.hasDeadline);
    setTaskDeadline(t.deadline || '');
    setTimeOption(t.startTime && t.endTime && t.startTime !== t.endTime ? 'range' : 'deadline');
    setTaskHours(t.estimatedHours);
    setTaskStart(t.startTime || '09:00');
    setTaskEnd(t.endTime || '11:00');
    setTaskPriority(t.priority);
    setTaskNotes(t.notes || '');
    document.querySelector('.modal-content')?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEditingEvent = (e: FixedEvent) => {
    setEditingId(e.id);
    setEventTitle(e.title);
    setEventType(e.type);
    setEventColor(e.color);
    setEventDay(e.day || 'Monday');
    setEventStart(e.startTime);
    setEventEnd(e.endTime);
    document.querySelector('.modal-content')?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editingId ? 'Edit Item' : 'Schedule Manager'}</h2>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button onClick={() => { setActiveTab('tasks'); setEditingId(null); }} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'tasks' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.85rem', padding: '10px' }}>
            <ListTodo size={16} /><span>Tasks</span>
          </button>
          <button onClick={() => { setActiveTab('events'); setEditingId(null); }} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'events' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.85rem', padding: '10px' }}>
            <Calendar size={16} /><span>Classes</span>
          </button>
          <button onClick={() => { setActiveTab('settings'); setEditingId(null); }} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'settings' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.85rem', padding: '10px' }}>
            <LayoutGrid size={16} /><span>Settings</span>
          </button>
        </div>

        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '6px' }}>
          {activeTab === 'tasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <form onSubmit={handleAddTaskSubmit} className="card" style={{ backgroundColor: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderStyle: editingId ? 'solid' : 'dashed', borderColor: editingId ? 'var(--primary)' : 'var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#fff' }}>{editingId ? 'Updating Task...' : 'Add New Task'}</h3>
                  {editingId && <button type="button" onClick={resetTaskForm} className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>Cancel Edit</button>}
                </div>

                <div className="form-group">
                  <label className="form-label">Task Name</label>
                  <input type="text" className="form-control" placeholder="e.g. Physics Lab" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-control" value={taskCategory} onChange={(e: any) => setTaskCategory(e.target.value)}>
                      <option value="assignment">📝 Assignment</option>
                      <option value="quiz">❓ Quiz</option>
                      <option value="program">💻 Program</option>
                      <option value="date">📅 Date/Exam</option>
                      <option value="training">💪 Training</option>
                      <option value="other">✨ Other</option>
                    </select>
                  </div>
                  {taskCategory === 'other' && (
                    <div className="form-group">
                      <label className="form-label">What is it?</label>
                      <input type="text" className="form-control" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Type here..." required />
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Task Color</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {COLORS.map(c => (
                      <div key={c} onClick={() => setTaskColor(c)} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: c, border: taskColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>

                <div className="form-row" style={{ alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 0.5 }}>
                    <label className="form-label">Priority</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['low', 'medium', 'high'] as const).map(p => (
                        <button key={p} type="button" onClick={() => setTaskPriority(p)} className="btn" style={{ flex: 1, padding: '8px', backgroundColor: taskPriority === p ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid var(--border-color)', fontSize: '1.1rem' }}>
                          {getPriorityIcon(p)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Deadline?</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><input type="radio" checked={hasDeadline} onChange={() => setHasDeadline(true)} /> Yes</label>
                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><input type="radio" checked={!hasDeadline} onChange={() => setHasDeadline(false)} /> No</label>
                      </div>
                    </label>
                    <input type="date" className="form-control" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} disabled={!hasDeadline} style={{ opacity: hasDeadline ? 1 : 0.5 }} required={hasDeadline} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Specific Time</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button type="button" onClick={() => setTimeOption('range')} className={`btn ${timeMode === 'range' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.8rem' }}><Clock size={14} /> Between Hours</button>
                    <button type="button" onClick={() => setTimeOption('deadline')} className={`btn ${timeMode === 'deadline' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.8rem' }}><Timer size={14} /> Specific Deadline</button>
                  </div>
                  {timeMode === 'range' ? (
                    <div className="form-row">
                      <input type="time" className="form-control" value={taskStart} onChange={(e) => setTaskStart(e.target.value)} required />
                      <input type="time" className="form-control" value={taskEnd} onChange={(e) => setTaskEnd(e.target.value)} required />
                    </div>
                  ) : (
                    <input type="time" className="form-control" value={taskStart} onChange={(e) => setTaskStart(e.target.value)} required />
                  )}
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.8rem', fontWeight: 600 }}>{editingId ? 'Update Task' : 'Add Task'}</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>Active Tasks</h4>
                {tasks.length === 0 ? <p style={{ textAlign: 'center', fontSize: '0.8rem', padding: '1.5rem', color: 'var(--text-muted)' }}>No tasks scheduled yet.</p> : tasks.map(t => (
                  <div key={t.id} className="timeline-card" style={{ borderLeft: `4px solid ${t.color}`, padding: '0.75rem 1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{getCategoryEmoji(t.category)}</span>
                        <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{t.title}</span>
                        <span>{getPriorityIcon(t.priority)}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {t.hasDeadline ? `Due: ${fmtDate(t.deadline)}` : 'No deadline'} • {t.estimatedHours}h
                        {t.startTime && ` • ${t.startTime}${t.endTime && t.endTime !== t.startTime ? '-' + t.endTime : ''}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => startEditingTask(t)} className="btn btn-secondary" style={{ padding: '6px' }}><LayoutGrid size={14} /></button>
                      <button onClick={() => { if(window.confirm('Delete this task?')) onDeleteTask(t.id); }} className="btn btn-danger" style={{ padding: '6px' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <form onSubmit={handleAddEventSubmit} className="card" style={{ backgroundColor: 'rgba(255,255,255,0.01)', padding: '1.25rem', borderStyle: editingId ? 'solid' : 'dashed', borderColor: editingId ? 'var(--primary)' : 'var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', color: '#fff' }}>{editingId ? 'Updating Class...' : 'Block New Time'}</h3>
                  {editingId && <button type="button" onClick={resetEventForm} className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>Cancel Edit</button>}
                </div>

                <div className="form-group">
                  <label className="form-label">Event Name</label>
                  <input type="text" className="form-control" placeholder="e.g. Bio 101" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={eventType} onChange={(e: any) => setEventType(e.target.value)}>
                      <option value="class">🏫 Class</option>
                      <option value="training">💪 Training</option>
                      <option value="meeting">👥 Meeting</option>
                      <option value="work">💼 Work</option>
                      <option value="other">✨ Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Day</label>
                    <select className="form-control" value={eventDay} onChange={(e: any) => setEventDay(e.target.value)}>
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Theme Color</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                    {COLORS.map(c => (
                      <div key={c} onClick={() => setEventColor(c)} style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: c, border: eventColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group"><label className="form-label">Start</label><input type="time" className="form-control" value={eventStart} onChange={(e) => setEventStart(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">End</label><input type="time" className="form-control" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} required /></div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.8rem' }}>{editingId ? 'Update Class' : 'Block Weekly Slots'}</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fixed Commitments</h4>
                {events.length === 0 ? <p style={{ textAlign: 'center', fontSize: '0.8rem', padding: '1.5rem', color: 'var(--text-muted)' }}>No fixed slots blocked.</p> : events.map(e => (
                  <div key={e.id} className="timeline-card" style={{ borderLeft: `4px solid ${e.color}`, padding: '0.6rem 0.8rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{e.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{e.day} • {e.startTime}-{e.endTime}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => startEditingEvent(e)} className="btn btn-secondary" style={{ padding: '6px' }}><LayoutGrid size={14} /></button>
                      <button onClick={() => { if(window.confirm('Delete this class?')) onDeleteEvent(e.id); }} className="btn btn-danger" style={{ padding: '6px' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <form onSubmit={handlePrefsSubmit} className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={18} color="var(--primary)" /> Timetable Defaults</h3>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Earliest Slot</label><input type="time" className="form-control" value={earliest} onChange={(e) => setEarliest(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Latest Slot</label><input type="time" className="form-control" value={latest} onChange={(e) => setLatest(e.target.value)} required /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Study Hours/Day</label>
                  <input type="number" className="form-control" value={maxHours} onChange={(e) => setMaxHours(parseInt(e.target.value) || 4)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>Update Preferences</button>
              </form>

              <div className="card" style={{ borderColor: 'rgba(239,68,68,0.2)', padding: '1.25rem', backgroundColor: 'rgba(239,68,68,0.02)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>This will permanently delete all your tasks, fixed schedules, and preferences.</p>
                <button onClick={() => { if(window.confirm('Are you absolutely sure? This cannot be undone.')) onResetData(); }} className="btn btn-danger" style={{ width: '100%', fontWeight: 600 }}>Reset All Data</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
