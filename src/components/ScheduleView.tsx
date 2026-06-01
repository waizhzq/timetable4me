import React, { useState } from 'react';
import type { Task, FixedEvent, StudySession } from '../services/db';
import {
  ArrowLeft,
  Plus,
  Trash2,
  BookOpen,
  Download
} from 'lucide-react';
import { exportWeekAsPdf } from '../utils/exportPdf';

interface ScheduleViewProps {
  tasks: Task[];
  events: FixedEvent[];
  sessions: StudySession[];
  onBack: () => void;
  onOpenManager: () => void;
  onDeleteTask: (id: string) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  tasks,
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
      backgroundColor: 'var(--bg-app)', 
      color: 'var(--text-primary)',
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
        backgroundColor: 'var(--primary)', 
        padding: '1.5rem 1rem', 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <button onClick={onBack} style={{
          position: 'absolute',
          left: '1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#fff'
        }}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{
          fontSize: '1.25rem',
          margin: 0,
          color: '#fff',
          background: 'none',
          WebkitTextFillColor: 'initial',
          fontWeight: 700
        }}>Schedule</h1>
        <button
          onClick={() => exportWeekAsPdf(events, sessions, tasks)}
          title="Export week as PDF"
          style={{
            position: 'absolute',
            right: '1rem',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '6px 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          <Download size={15} />
          PDF
        </button>
      </header>

      {/* Day Selector */}
      <div style={{ 
        padding: '1rem', 
        display: 'flex', 
        gap: '0.5rem', 
        overflowX: 'auto',
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-color)'
      }} className="no-scrollbar">
        {days.map((day, idx) => (
          <button 
            key={day}
            onClick={() => setSelectedDayIdx(idx)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: selectedDayIdx === idx ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
              color: selectedDayIdx === idx ? '#fff' : 'var(--text-secondary)',
              fontWeight: 700,
              minWidth: '65px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedDayIdx === idx ? 'var(--shadow-glow)' : 'none'
            }}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-app)' }}>
        {dayEvents.length === 0 && daySessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
            <BookOpen size={64} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
            <p style={{ fontSize: '1.1rem' }}>No classes or tasks scheduled for {selectedDayName}.</p>
          </div>
        ) : (
          <>
            {dayEvents.map(event => (
              <div key={event.id} className="schedule-card" style={{
                backgroundColor: 'var(--bg-sidebar)',
                borderRadius: '16px',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)',
                position: 'relative',
                borderLeft: `4px solid ${event.color || 'var(--secondary)'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '0.02em' }}>{event.title.toUpperCase()}</h3>
                  <button 
                    onClick={() => handleDelete('event', event.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: 0.7 }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 500 }}>
                  {event.notes ? event.notes.split('\n')[0] : (event.customType || event.type)}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {/* Simplified metadata */}
                    <span>{event.notes && event.notes.includes('\n') ? event.notes.split('\n')[1] : (event.customType || event.type)}</span>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
                    {event.startTime} - {event.endTime}
                  </div>
                </div>
              </div>
            ))}

            {daySessions.map(session => {
              const task = tasks.find(t => t.id === session.taskId);
              const taskColor = task?.color || 'var(--primary)';
              return (
                <div key={session.id} className="schedule-card" style={{
                  backgroundColor: 'var(--bg-sidebar)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--border-color)',
                  borderLeft: `4px solid ${taskColor}`,
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '0.02em' }}>{session.taskTitle.toUpperCase()}</h3>
                    <button 
                      onClick={() => handleDelete('session', session.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: 0.7 }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1rem', fontWeight: 500 }}>
                    Study Session • {task?.category || 'General'}
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Scheduled Productivity
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
                      {new Date(session.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - {new Date(session.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer / Add Button */}
      <footer style={{ 
        padding: '1.5rem', 
        backgroundColor: 'var(--bg-sidebar)', 
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <button 
          onClick={onOpenManager}
          style={{ 
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))', 
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
            boxShadow: '0 6px 20px rgba(234, 84, 85, 0.3)'
          }}
        >
          <Plus size={24} strokeWidth={3} />
          ADD NEW TASK / CLASS
        </button>
      </footer>

      {/* Accent bar at the very bottom using Palette Slate */}
      <div style={{ height: '30px', backgroundColor: 'var(--bg-slate)', width: '100%', borderTop: '1px solid var(--border-color)' }}></div>
    </div>
  );
};
