import React, { useState } from 'react';
import type { Task, FixedEvent, StudySession } from '../services/db';
import { ArrowLeft, Download, Plus, CheckCircle2, Circle, Repeat2 } from 'lucide-react';
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

const SHORT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const FULL_DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function durationLabel(start: string, end: string) {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  tasks, events, sessions,
  onBack, onOpenManager, onDeleteTask, onDeleteEvent,
}) => {
  const today     = new Date();
  const todayIdx  = today.getDay();
  const [selDay, setSelDay] = useState(todayIdx);

  // Week dates (Sun–Sat of this week)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - todayIdx + i);
    return d;
  });
  const selDate     = weekDates[selDay];
  const selDateStr  = selDate.toISOString().split('T')[0];
  const selDayName  = FULL_DAYS[selDay];

  // Merge events + sessions for selected day, sorted by start time
  const dayItems = [
    ...events
      .filter(e => e.recurring ? e.day === selDayName : e.date === selDateStr)
      .map(e => ({
        key:      e.id,
        kind:     'event' as const,
        id:       e.id,
        taskId:   null as string | null,
        title:    e.title,
        color:    e.color,
        timeFrom: e.startTime,
        timeTo:   e.endTime,
        sortKey:  e.startTime,
        category: e.customType || e.type,
        recurring: e.recurring,
        done:     false,
      })),
    ...sessions
      .filter(s => s.start.startsWith(selDateStr))
      .map(s => {
        const task = tasks.find(t => t.id === s.taskId);
        return {
          key:      s.id,
          kind:     'session' as const,
          id:       s.id,
          taskId:   s.taskId,
          title:    s.taskTitle,
          color:    task?.color || '#EA5455',
          timeFrom: fmtTime(s.start),
          timeTo:   fmtTime(s.end),
          sortKey:  new Date(s.start).toTimeString().slice(0, 5),
          category: task?.category || 'study',
          recurring: false,
          done:     s.completed,
          durationStr: durationLabel(s.start, s.end),
          start:    s.start,
          end:      s.end,
        };
      }),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const handleDelete = async (item: typeof dayItems[0]) => {
    const label = item.kind === 'event' ? 'event' : 'task';
    if (!window.confirm(`Delete this ${label}?`)) return;
    if (item.kind === 'event') {
      await onDeleteEvent(item.id);
    } else if (item.taskId) {
      await onDeleteTask(item.taskId);
    }
  };

  const headerDate = selDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'var(--bg-app)',
      display: 'flex', flexDirection: 'column',
      color: 'var(--text-primary)',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-app)',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}>
          <ArrowLeft size={22} />
        </button>

        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>{headerDate}</span>

        <button onClick={() => exportWeekAsPdf(events, sessions, tasks)}
          className="btn btn-secondary"
          style={{ padding: '5px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Download size={13} />
          PDF
        </button>
      </header>

      {/* ── Week strip ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '0', borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-sidebar)', flexShrink: 0, overflowX: 'auto',
      }} className="no-scrollbar">
        {weekDates.map((d, i) => {
          const isToday = i === todayIdx;
          const isSel   = i === selDay;
          return (
            <button key={i} onClick={() => setSelDay(i)}
              style={{
                flex: '1 0 0', minWidth: '44px', padding: '0.75rem 0.25rem',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                borderBottom: isSel ? '2px solid var(--primary)' : '2px solid transparent',
                transition: 'border-color 0.15s',
              }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isSel ? '#fff' : 'var(--text-muted)' }}>
                {SHORT_DAYS[i]}
              </span>
              <span style={{
                width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', fontWeight: isSel ? 700 : 400,
                backgroundColor: isToday ? 'var(--primary)' : 'transparent',
                color: isToday ? '#fff' : isSel ? '#fff' : 'var(--text-secondary)',
              }}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {dayItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '0.9rem' }}>Nothing on {selDayName}.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {dayItems.map((item, idx) => {
              const prevItem  = idx > 0 ? dayItems[idx - 1] : null;
              const showGap   = prevItem && item.sortKey > prevItem.sortKey;
              const isDone    = item.done;

              return (
                <React.Fragment key={item.key}>
                  {/* Gap indicator between blocks with a time gap */}
                  {showGap && (
                    <div style={{ height: '1px', margin: '0 1rem', backgroundColor: 'var(--border-color)', opacity: 0.5 }} />
                  )}

                  <div style={{
                    display: 'flex', alignItems: 'stretch', gap: '0',
                    padding: '0 1rem',
                    opacity: isDone ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                    {/* Time column */}
                    <div style={{ width: '52px', flexShrink: 0, paddingTop: '1rem', paddingRight: '0.75rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', lineHeight: 1 }}>
                        {item.timeFrom}
                      </span>
                    </div>

                    {/* Color stripe */}
                    <div style={{ width: '3px', flexShrink: 0, backgroundColor: item.color, borderRadius: '2px', margin: '0.75rem 0', opacity: 0.85 }} />

                    {/* Content */}
                    <div style={{ flex: 1, padding: '0.875rem 0 0.875rem 0.875rem', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                            {/* Done indicator for sessions */}
                            {item.kind === 'session' && (
                              isDone
                                ? <CheckCircle2 size={14} color="#34d399" style={{ flexShrink: 0 }} />
                                : <Circle size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                            )}
                            <span style={{
                              fontSize: '0.92rem', fontWeight: 600, color: isDone ? 'var(--text-muted)' : '#fff',
                              textDecoration: isDone ? 'line-through' : 'none',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {item.title}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {item.timeFrom}–{item.timeTo}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', opacity: 0.6 }}>·</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                              {item.category}
                            </span>
                            {item.recurring && (
                              <>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', opacity: 0.6 }}>·</span>
                                <Repeat2 size={11} color="var(--text-muted)" />
                              </>
                            )}
                            {'durationStr' in item && (
                              <>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', opacity: 0.6 }}>·</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.durationStr}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Delete */}
                        <button onClick={() => handleDelete(item)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0, opacity: 0.4, display: 'flex' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0.875rem 1rem',
        paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-sidebar)',
        flexShrink: 0,
      }}>
        <button onClick={onOpenManager} className="btn btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Plus size={16} />
          Add task or class
        </button>
      </div>
    </div>
  );
};
