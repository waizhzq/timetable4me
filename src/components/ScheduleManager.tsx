import React, { useState } from 'react';
import type { Task, FixedEvent, UserPreferences } from '../services/db';
import {
  Trash2,
  Calendar,
  ListTodo,
  X,
  LayoutGrid
} from 'lucide-react';

interface ScheduleManagerProps {
  tasks: Task[];
  events: FixedEvent[];
  preferences: UserPreferences;
  conflictedTaskIds: string[];
  onAddTask: (task: Omit<Task, 'id'>) => Promise<void>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddEvent: (event: Omit<FixedEvent, 'id'>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
  onResetData: () => void;
  onClose: () => void;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  tasks,
  events,
  preferences,
  onAddTask,
  onDeleteTask,
  onAddEvent,
  onDeleteEvent,
  onSavePreferences,
  onResetData,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'events' | 'settings'>('tasks');

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [taskHours, setTaskHours] = useState<number>(4);
  const [taskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskNotes, setTaskNotes] = useState('');

  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventType] = useState<'class' | 'training' | 'meeting' | 'work' | 'other'>('class');
  const [eventDay, setEventDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>('Monday');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('11:00');

  // Preferences State
  const [earliest, setEarliest] = useState(preferences.earliestStudyTime);
  const [latest, setLatest] = useState(preferences.latestStudyTime);
  const [maxHours, setMaxHours] = useState(preferences.maxStudyHoursPerDay);

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDeadline) return;

    await onAddTask({
      title: taskTitle,
      deadline: taskDeadline,
      estimatedHours: taskHours,
      completedHours: 0,
      priority: taskPriority,
      status: 'pending',
      notes: taskNotes.trim() || undefined,
      subtasks: [],
    });

    setTaskTitle('');
    setTaskDeadline('');
    setTaskNotes('');
  };

  const handleAddEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    await onAddEvent({
      title: eventTitle,
      type: eventType,
      day: eventDay,
      startTime: eventStart,
      endTime: eventEnd,
      recurring: true,
    });

    setEventTitle('');
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', backgroundColor: 'var(--bg-app)' }}>
        <div className="modal-header">
          <h2 className="modal-title">Schedule Manager</h2>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button onClick={() => setActiveTab('tasks')} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'tasks' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.8rem', padding: '8px' }}>
            <ListTodo size={14} /><span>Tasks</span>
          </button>
          <button onClick={() => setActiveTab('events')} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'events' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.8rem', padding: '8px' }}>
            <Calendar size={14} /><span>Classes</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className="btn" style={{ flex: 1, backgroundColor: activeTab === 'settings' ? 'var(--primary)' : 'transparent', color: '#fff', fontSize: '0.8rem', padding: '8px' }}>
            <LayoutGrid size={14} /><span>Settings</span>
          </button>
        </div>

        <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px' }}>
          {activeTab === 'tasks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <form onSubmit={handleAddTaskSubmit} className="card" style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderStyle: 'dashed' }}>
                <div className="form-group">
                  <label className="form-label">Task Name</label>
                  <input type="text" className="form-control" placeholder="e.g. Physics Assignment" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Deadline</label><input type="date" className="form-control" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Est. Hours</label><input type="number" min="1" className="form-control" value={taskHours} onChange={(e) => setTaskHours(parseInt(e.target.value) || 1)} required /></div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Add Assignment</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Assignments</h4>
                {tasks.length === 0 ? <p style={{ textAlign: 'center', fontSize: '0.8rem', padding: '1rem', color: 'var(--text-muted)' }}>No active tasks.</p> : tasks.map(t => (
                  <div key={t.id} className="timeline-card" style={{ padding: '0.6rem 0.8rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{t.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Due: {t.deadline} • {t.estimatedHours}h</div>
                    </div>
                    <button onClick={() => onDeleteTask(t.id)} className="btn btn-danger" style={{ padding: '6px' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <form onSubmit={handleAddEventSubmit} className="card" style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderStyle: 'dashed' }}>
                <div className="form-group">
                  <label className="form-label">Event Name</label>
                  <input type="text" className="form-control" placeholder="e.g. Math Lecture" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Day of Week</label>
                  <select className="form-control" value={eventDay} onChange={(e: any) => setEventDay(e.target.value)}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Start</label><input type="time" className="form-control" value={eventStart} onChange={(e) => setEventStart(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">End</label><input type="time" className="form-control" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} required /></div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Block Weekly Slots</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fixed Commitments</h4>
                {events.length === 0 ? <p style={{ textAlign: 'center', fontSize: '0.8rem', padding: '1rem', color: 'var(--text-muted)' }}>No fixed events.</p> : events.map(e => (
                  <div key={e.id} className="timeline-card" style={{ padding: '0.6rem 0.8rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{e.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{e.day} • {e.startTime}-{e.endTime}</div>
                    </div>
                    <button onClick={() => onDeleteEvent(e.id)} className="btn btn-danger" style={{ padding: '6px' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <form onSubmit={handlePrefsSubmit} className="card" style={{ padding: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#fff' }}>Timetable Range</h3>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Earliest Slot</label><input type="time" className="form-control" value={earliest} onChange={(e) => setEarliest(e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label">Latest Slot</label><input type="time" className="form-control" value={latest} onChange={(e) => setLatest(e.target.value)} required /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Study Hours/Day</label>
                  <input type="number" className="form-control" value={maxHours} onChange={(e) => setMaxHours(parseInt(e.target.value) || 4)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Update Preferences</button>
              </form>

              <div className="card" style={{ borderColor: 'rgba(239,68,68,0.2)', padding: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Resetting will clear all your tasks and fixed schedules.</p>
                <button onClick={() => { if(window.confirm('Reset everything?')) onResetData(); }} className="btn btn-danger" style={{ width: '100%' }}>Reset All Data</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
