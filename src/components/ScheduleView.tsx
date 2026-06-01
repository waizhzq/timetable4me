import React, { useState } from 'react';
import type { Task, FixedEvent, StudySession } from '../services/db';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  BookOpen
} from 'lucide-react';

interface ScheduleViewProps {
  events: FixedEvent[];
  sessions: StudySession[];
  onBack: () => void;
  onOpenManager: () => void;
  onDeleteTask: (id: string) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  events,
  sessions,
  onBack,
  onOpenManager,
  onDeleteTask,
  onDeleteEvent,
}) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const now = new Date();
  const [selectedDayIdx, setSelectedDayIdx] = useState(now.getDay());

  const selectedDayName = fullDays[selectedDayIdx];

  // Filter events for the selected day
  const dayEvents = events.filter(e => e.day === selectedDayName);
  
  // Filter tasks that have a specific time on the selected day
  // (Assuming tasks with startTime/endTime are fixed for a day)
  // We'll also include study sessions for this day
  const daySessions = sessions.filter(s => {
    const sDate = new Date(s.start);
    return sDate.getDay() === selectedDayIdx;
  });

  const handleDelete = async (type: 'event' | 'session', id: string) => {
    if (window.confirm(`Are you sure you want to delete this ${type}?`)) {
      if (type === 'event') {
        await onDeleteEvent(id);
      } else {
        // For sessions, we might want to delete the task or just the session
        // The user said "add or delete the task"
        // In the context of the image, they are likely talking about the items shown
        const session = daySessions.find(s => s.id === id);
        if (session) {
          await onDeleteTask(session.taskId);
        }
      }
    }
  };

  return (
    <div className="schedule-view" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      backgroundColor: '#fff', // White background as in image
      color: '#000',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <header style={{ 
        backgroundColor: 'var(--accent)', 
        padding: '1.5rem 1rem', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <button onClick={onBack} style={{ 
          position: 'absolute', 
          left: '1rem', 
          background: 'none', 
          border: 'none', 
          cursor: 'pointer',
          color: '#000'
        }}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ 
          fontSize: '1.25rem', 
          margin: 0, 
          color: '#000',
          background: 'none',
          WebkitTextFillColor: 'initial',
          fontWeight: 600
        }}>Schedule</h1>
      </header>

      {/* Day Selector */}
      <div style={{ 
        padding: '1rem', 
        display: 'flex', 
        gap: '0.5rem', 
        overflowX: 'auto',
        backgroundColor: '#fff',
        borderBottom: '1px solid #eee'
      }} className="no-scrollbar">
        {days.map((day, idx) => (
          <button 
            key={day}
            onClick={() => setSelectedDayIdx(idx)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: selectedDayIdx === idx ? 'var(--info)' : '#f0f0f0',
              color: selectedDayIdx === idx ? '#fff' : '#888',
              fontWeight: 600,
              minWidth: '60px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {dayEvents.length === 0 && daySessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
            <BookOpen size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p>No classes or tasks scheduled for {selectedDayName}.</p>
          </div>
        ) : (
          <>
            {dayEvents.map(event => (
              <div key={event.id} className="schedule-card" style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                border: '1px solid #f0f0f0',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#000', fontWeight: 700 }}>{event.title.toUpperCase()}</h3>
                  <button 
                    onClick={() => handleDelete('event', event.id)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  {event.notes ? event.notes : (event.customType || event.type)}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                  <div style={{ color: '#888', fontSize: '0.85rem' }}>
                    {/* Placeholder for location if not in notes */}
                    {event.notes && event.notes.includes('\n') ? event.notes.split('\n')[1] : ''}
                  </div>
                  <div style={{ fontWeight: 600, color: '#000', fontSize: '0.9rem' }}>
                    {event.startTime} - {event.endTime}
                  </div>
                </div>
              </div>
            ))}

            {daySessions.map(session => (
              <div key={session.id} className="schedule-card" style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                border: '1px solid #f0f0f0',
                borderLeft: '4px solid var(--primary)',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#000', fontWeight: 700 }}>{session.taskTitle.toUpperCase()}</h3>
                  <button 
                    onClick={() => handleDelete('session', session.id)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Study Session
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                  <div style={{ color: '#888', fontSize: '0.85rem' }}>
                    Scheduled Task
                  </div>
                  <div style={{ fontWeight: 600, color: '#000', fontSize: '0.9rem' }}>
                    {new Date(session.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(session.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer / Add Button */}
      <footer style={{ 
        padding: '1.25rem', 
        backgroundColor: '#fff', 
        borderTop: '1px solid #eee',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <button 
          onClick={onOpenManager}
          style={{ 
            backgroundColor: 'var(--info)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '16px', 
            padding: '1.1rem 2rem', 
            fontWeight: 800,
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)'
          }}
        >
          <Plus size={24} strokeWidth={3} />
          ADD NEW TASK / CLASS
        </button>
      </footer>

      {/* Blue bar at the very bottom as in image */}
      <div style={{ height: '40px', backgroundColor: 'var(--info)', width: '100%' }}></div>
    </div>
  );
};
