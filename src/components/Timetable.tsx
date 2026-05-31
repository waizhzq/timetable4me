import React, { useState } from 'react';
import type { FixedEvent, StudySession, UserPreferences } from '../services/db';
import { ChevronLeft, ChevronRight, Plus, X, Check, BookOpen, RefreshCw } from 'lucide-react';

interface TimetableProps {
  events: FixedEvent[];
  sessions: StudySession[];
  preferences: UserPreferences;
  onAddEvent: (event: Omit<FixedEvent, 'id'>) => Promise<void>;
  onToggleSession: (
    sessionId: string,
    completed: boolean,
    hours: number,
    taskId: string
  ) => void;
  onRegenerate: () => void;
}

export const Timetable: React.FC<TimetableProps> = ({
  events,
  sessions,
  preferences,
  onAddEvent,
  onToggleSession,
  onRegenerate,
}) => {
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal form states
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'class' | 'training' | 'meeting' | 'work' | 'other'>('class');
  const [eventDay, setEventDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>('Monday');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventRecurring, setEventRecurring] = useState(true);
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);

  // Days list
  const DAYS: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  // Helper to get Monday of the week for a given date
  const getMonday = (d: Date): Date => {
    const date = new Date(d.getTime());
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const mondayDate = getMonday(currentDate);

  // Get dates for the current week view
  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(mondayDate.getTime());
    d.setDate(mondayDate.getDate() + i);
    return d;
  });

  // Active days to display depending on view mode
  const activeDates = viewMode === 'week' ? weekDates : [currentDate];

  // Get hours range from preferences
  const startHour = Math.floor(
    parseInt(preferences.earliestStudyTime.split(':')[0])
  );
  const endHour = Math.ceil(
    parseInt(preferences.latestStudyTime.split(':')[0])
  );
  const hours = Array.from({ length: endHour - startHour }).map(
    (_, i) => startHour + i
  );

  // Navigate week
  const adjustDate = (days: number) => {
    const next = new Date(currentDate.getTime());
    next.setDate(currentDate.getDate() + days);
    setCurrentDate(next);
  };

  const handleOpenAddModal = (
    date?: Date,
    hour?: number
  ) => {
    if (date) {
      const dayOfWeekName = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
      setEventDay(dayOfWeekName);
      setEventDate(date.toISOString().split('T')[0]);
    } else {
      setEventDate(new Date().toISOString().split('T')[0]);
    }
    if (hour !== undefined) {
      const pad = (n: number) => (n < 10 ? `0${n}` : n);
      setEventStart(`${pad(hour)}:00`);
      setEventEnd(`${pad(hour + 1)}:00`);
    }
    setIsModalOpen(true);
  };

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    await onAddEvent({
      title: eventTitle,
      type: eventType,
      day: eventRecurring ? eventDay : undefined,
      date: eventRecurring ? undefined : eventDate,
      startTime: eventStart,
      endTime: eventEnd,
      recurring: eventRecurring,
    });

    setEventTitle('');
    setIsModalOpen(false);
  };

  // Helper to parse time string into decimal
  const timeToDecimal = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h + m / 60;
  };

  // Helper to format 24h decimal to HH:MM
  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Helper to get formatted day header
  const formatDayHeader = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    return {
      name: DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1],
      dateStr: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      isToday,
    };
  };

  return (
    <div className="card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Timetable Header */}
      <div className="timetable-header">
        <div className="timetable-week-nav">
          <button className="btn btn-secondary" onClick={() => adjustDate(viewMode === 'week' ? -7 : -1)}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontWeight: 650, color: '#fff', fontSize: '1.1rem' }}>
            {viewMode === 'week' ? (
              <>
                Week of {mondayDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </>
            ) : (
              currentDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            )}
          </span>
          <button className="btn btn-secondary" onClick={() => adjustDate(viewMode === 'week' ? 7 : 1)}>
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={onRegenerate}
            style={{ display: 'flex', gap: '0.5rem', borderStyle: 'dashed', borderColor: 'var(--primary)' }}
          >
            <RefreshCw size={14} className="logo-icon" />
            <span>Regenerate Schedule</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => handleOpenAddModal()}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <Plus size={16} />
            <span>Add Fixed Commitment</span>
          </button>

          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--border-radius-md)',
              padding: '2px',
            }}
          >
            <button
              className="btn"
              onClick={() => setViewMode('week')}
              style={{
                padding: '4px 12px',
                fontSize: '0.8rem',
                backgroundColor: viewMode === 'week' ? 'var(--primary)' : 'transparent',
                color: '#fff',
              }}
            >
              Week
            </button>
            <button
              className="btn"
              onClick={() => setViewMode('day')}
              style={{
                padding: '4px 12px',
                fontSize: '0.8rem',
                backgroundColor: viewMode === 'day' ? 'var(--primary)' : 'transparent',
                color: '#fff',
              }}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* Grid view */}
      <div
        className="timetable-grid"
        style={{
          gridTemplateColumns: `80px repeat(${activeDates.length}, 1fr)`,
        }}
      >
        {/* Top-Left Corner */}
        <div className="timetable-corner" />

        {/* Day Headers */}
        {activeDates.map((date) => {
          const header = formatDayHeader(date);
          return (
            <div key={date.toISOString()} className={`timetable-day-header ${header.isToday ? 'today' : ''}`}>
              <div className="timetable-day-name">{header.name}</div>
              <div className="timetable-day-date">{header.dateStr}</div>
            </div>
          );
        })}

        {/* Calendar Rows */}
        {hours.map((hour) => (
          <React.Fragment key={hour}>
            {/* Time Label Column */}
            <div className="timetable-time-label">{formatHour(hour)}</div>

            {/* Column slots for each date */}
            {activeDates.map((date) => {
              const dateStr = date.toISOString().split('T')[0];
              const dayOfWeekName = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];

              // 1. Check for fixed events starting at this hour
              const startingFixedEvents = events.filter((e) => {
                if (e.recurring) {
                  if (e.day !== dayOfWeekName) return false;
                } else {
                  if (e.date !== dateStr) return false;
                }
                const startDec = timeToDecimal(e.startTime);
                return Math.floor(startDec) === hour;
              });

              // 2. Check for study sessions starting at this hour on this date
              const startingStudySessions = sessions.filter((s) => {
                if (!s.start.startsWith(dateStr)) return false;
                const sHour = new Date(s.start).getHours();
                return sHour === hour;
              });

              // 3. Check if covered by a block starting in an earlier hour
              const isCoveredByEvent = events.some((e) => {
                if (e.recurring) {
                  if (e.day !== dayOfWeekName) return false;
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

              return (
                <div
                  key={date.toISOString() + hour}
                  className="timetable-cell"
                  onClick={() => !isCovered && handleOpenAddModal(date, hour)}
                >
                  {!isCovered && startingFixedEvents.map((evt) => {
                    const startDec = timeToDecimal(evt.startTime);
                    const endDec = timeToDecimal(evt.endTime);
                    const heightSpan = endDec - startDec;

                    return (
                      <div
                        key={evt.id}
                        className={`timetable-block fixed ${evt.type === 'training' ? 'training' : ''}`}
                        style={{
                          top: `calc(${(startDec - Math.floor(startDec)) * 64}px + 2px)`,
                          height: `calc(${heightSpan * 64}px - 4px)`,
                        }}
                        onClick={(e) => e.stopPropagation()} // Stop event bubbling
                      >
                        <div className="timetable-block-title">{evt.title}</div>
                        <div className="timetable-block-meta">
                          <span style={{ textTransform: 'capitalize' }}>{evt.type}</span>
                          <span>{evt.startTime} - {evt.endTime}</span>
                        </div>
                      </div>
                    );
                  })}

                  {!isCovered && startingStudySessions.map((session) => {
                    const sTime = new Date(session.start);
                    const eTime = new Date(session.end);
                    const startDec = sTime.getHours() + sTime.getMinutes() / 60;
                    const endDec = eTime.getHours() + eTime.getMinutes() / 60;
                    const heightSpan = endDec - startDec;

                    return (
                      <div
                        key={session.id}
                        className={`timetable-block study ${session.completed ? 'completed' : ''}`}
                        style={{
                          top: `calc(${(startDec - Math.floor(startDec)) * 64}px + 2px)`,
                          height: `calc(${heightSpan * 64}px - 4px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSession(
                            session.id,
                            !session.completed,
                            heightSpan,
                            session.taskId
                          );
                        }}
                      >
                        <div className="timetable-block-title">{session.taskTitle}</div>
                        <div className="timetable-block-meta">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {session.completed ? <Check size={10} /> : <BookOpen size={10} />}
                            {session.completed ? 'Done' : 'Study'}
                          </span>
                          <span>
                            {new Date(session.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Add Commitment Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Add Fixed Commitment</h3>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => setIsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitEvent}>
              <div className="form-group">
                <label className="form-label">Event Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Database Class, Football Training"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Commitment Type</label>
                <select
                  className="form-control"
                  value={eventType}
                  onChange={(e: any) => setEventType(e.target.value)}
                >
                  <option value="class">Class</option>
                  <option value="training">Training</option>
                  <option value="meeting">Meeting</option>
                  <option value="work">Work Shift</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Frequency</label>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                    <input
                      type="radio"
                      name="modal-recurring"
                      checked={eventRecurring}
                      onChange={() => setEventRecurring(true)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>Weekly Recurring</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                    <input
                      type="radio"
                      name="modal-recurring"
                      checked={!eventRecurring}
                      onChange={() => setEventRecurring(false)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>One-off Event</span>
                  </label>
                </div>
              </div>

              {eventRecurring ? (
                <div className="form-group">
                  <label className="form-label">Day of Week</label>
                  <select
                    className="form-control"
                    value={eventDay}
                    onChange={(e: any) => setEventDay(e.target.value)}
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
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
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
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Commitment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
