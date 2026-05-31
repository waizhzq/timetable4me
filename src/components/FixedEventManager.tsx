import React, { useState } from 'react';
import type { FixedEvent } from '../services/db';
import { Plus, Trash2, Calendar, Clock, BookOpen, Dumbbell, Users, Briefcase, LayoutGrid } from 'lucide-react';

interface FixedEventManagerProps {
  events: FixedEvent[];
  onAddEvent: (event: Omit<FixedEvent, 'id'>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
}

export const FixedEventManager: React.FC<FixedEventManagerProps> = ({
  events,
  onAddEvent,
  onDeleteEvent,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'class' | 'training' | 'meeting' | 'work' | 'other'>('class');
  const [day, setDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>('Monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [recurring, setRecurring] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onAddEvent({
      title,
      type,
      day: recurring ? day : undefined,
      date: recurring ? undefined : date,
      startTime,
      endTime,
      recurring,
    });

    setTitle('');
    setStartTime('09:00');
    setEndTime('11:00');
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'class':
        return <BookOpen size={16} style={{ color: '#60a5fa' }} />;
      case 'training':
        return <Dumbbell size={16} style={{ color: '#fde047' }} />;
      case 'meeting':
        return <Users size={16} style={{ color: '#c084fc' }} />;
      case 'work':
        return <Briefcase size={16} style={{ color: '#34d399' }} />;
      default:
        return <LayoutGrid size={16} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  const getEventBadgeStyle = (eventType: string) => {
    switch (eventType) {
      case 'class':
        return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' };
      case 'training':
        return { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' };
      case 'meeting':
        return { backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#c084fc' };
      case 'work':
        return { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399' };
      default:
        return { backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div className="dashboard-grid">
      {/* Left Column: Events List */}
      <div className="dashboard-panel-left">
        <div className="card">
          <div className="card-title">
            <Calendar className="logo-icon" size={20} />
            <h3>Fixed Commitments</h3>
          </div>
          <p style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            These fixed schedules block out specific slots in your calendar. Generated study sessions will never overlap these times.
          </p>

          {events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              No fixed commitments added yet. Add classes or training shifts to block off hours!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'rgba(255, 255, 255, 0.01)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {getEventIcon(event.type)}
                    </div>

                    <div>
                      <h4 style={{ color: '#fff', fontSize: '0.95rem' }}>{event.title}</h4>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: '0.15rem',
                        }}
                      >
                        <span>{event.recurring ? event.day : `${event.date} (One-off)`}</span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={12} />
                          {event.startTime} - {event.endTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span className="badge" style={getEventBadgeStyle(event.type)}>
                      {event.type}
                    </span>
                    <button
                      onClick={() => onDeleteEvent(event.id)}
                      className="btn btn-danger"
                      style={{ padding: '6px', borderRadius: '8px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Add Event Form */}
      <div className="dashboard-panel-right">
        <div className="card">
          <div className="card-title">
            <Plus className="logo-icon" size={18} />
            <h3>Add Commitment</h3>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Event Title</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Algorithms Lecture"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-control"
                value={type}
                onChange={(e: any) => setType(e.target.value)}
              >
                <option value="class">Class / Lecture</option>
                <option value="training">Training / Workout</option>
                <option value="meeting">Meeting / Sync</option>
                <option value="work">Work Shift</option>
                <option value="other">Other Commitment</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Frequency</label>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                  <input
                    type="radio"
                    name="recurring"
                    checked={recurring}
                    onChange={() => setRecurring(true)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span>Weekly Recurring</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                  <input
                    type="radio"
                    name="recurring"
                    checked={!recurring}
                    onChange={() => setRecurring(false)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span>One-off Event</span>
                </label>
              </div>
            </div>

            {recurring ? (
              <div className="form-group">
                <label className="form-label">Day of the Week</label>
                <select
                  className="form-control"
                  value={day}
                  onChange={(e: any) => setDay(e.target.value)}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Event Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
            >
              <span>Block Slots</span>
              <Plus size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
