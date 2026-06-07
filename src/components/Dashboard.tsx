import React, { useState, useEffect, useRef } from 'react';
import { animate } from 'animejs';
import type { Task, FixedEvent, StudySession, Todo } from '../services/db';
import { calculatePriorityScore } from '../services/scheduler';
import {
  Clock, CheckCircle2, Bookmark, Star, FileText,
  CheckSquare, Square, AlertCircle, ArrowRight,
  ListTodo, Trash2, BarChart2, Plus, CalendarDays, X, RotateCcw,
} from 'lucide-react';

const WORK_SECS  = 25 * 60;
const DAY_START  = 7;
const DAY_END    = 23;

const COLOR_IDLE  = 'rgba(176,228,204,0.28)';
const COLOR_WORK  = '#EA5455';
const COLOR_BREAK = '#B0E4CC';
const COLOR_DONE  = '#B0E4CC';

interface Props {
  tasks: Task[]; events: FixedEvent[]; sessions: StudySession[]; todos: Todo[];
  onToggleSession: (id: string, done: boolean, hrs: number, taskId: string) => void;
  onUpdateTask: (id: string, u: Partial<Task>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onUpdateEvent: (id: string, u: Partial<FixedEvent>) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
  onAddTodo: (text: string) => Promise<void>;
  onToggleTodo: (id: string, done: boolean) => Promise<void>;
  onDeleteTodo: (id: string) => Promise<void>;
  onClearDoneTodos: () => Promise<void>;
  onOpenManager: () => void;
  onOpenSchedule: () => void;
}

const DurationPill: React.FC<{
  label: string; value: number; step?: number;
  onDec: (e: React.MouseEvent) => void;
  onInc: (e: React.MouseEvent) => void;
}> = ({ label, value, onDec, onInc, step = 1 }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'0', backgroundColor:'rgba(176,228,204,0.05)', borderRadius:'4px', border:'1px solid rgba(176,228,204,0.12)', overflow:'hidden' }}>
    <span style={{ fontSize:'0.62rem', color:'rgba(176,228,204,0.4)', padding:'4px 10px 4px 12px', letterSpacing:'0.06em', textTransform:'uppercase', userSelect:'none' }}>{label}</span>
    <button onClick={onDec} style={{ background:'none', border:'none', borderLeft:'1px solid rgba(176,228,204,0.1)', cursor:'pointer', color:'rgba(176,228,204,0.5)', padding:'4px 9px', fontSize:'1rem', lineHeight:1, display:'flex', alignItems:'center' }}>−</button>
    <span style={{ fontFamily:"'DS-Digital', monospace", fontSize:'1.05rem', color:'#B0E4CC', padding:'0 6px', minWidth:'28px', textAlign:'center', userSelect:'none' }}>{value}{step > 1 ? 'm' : ''}</span>
    <button onClick={onInc} style={{ background:'none', border:'none', borderLeft:'1px solid rgba(176,228,204,0.1)', cursor:'pointer', color:'rgba(176,228,204,0.5)', padding:'4px 9px', fontSize:'1rem', lineHeight:1, display:'flex', alignItems:'center' }}>+</button>
  </div>
);

export const Dashboard: React.FC<Props> = ({
  tasks, events, sessions, todos,
  onToggleSession, onUpdateTask, onDeleteTask, onUpdateEvent, onDeleteEvent,
  onAddTodo, onToggleTodo, onDeleteTodo, onClearDoneTodos,
  onOpenManager, onOpenSchedule,
}) => {
  const now       = new Date();
  const getLocalToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayStr  = getLocalToday();
  const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];

  const parseLocalISO = (iso: string) => {
    const [datePart, timePart] = iso.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm, ss] = (timePart || '00:00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, ss || 0);
  };

  // ── Inspector ────────────────────────────────────────────────────────────
  const [sel, setSel] = useState<{type:'study'|'fixed';id:string;dbId:string;title:string;category:string;start:string;end:string;completed:boolean}|null>(null);
  const [subText,     setSubText]     = useState('');
  const [noteText,    setNoteText]    = useState('');
  const [editingNote, setEditingNote] = useState(false);

  // ── To-Do ────────────────────────────────────────────────────────────────
  const [newTodo, setNewTodo] = useState('');

  // ── FAB ──────────────────────────────────────────────────────────────────
  const [fabOpen, setFabOpen] = useState(false);

  // ── Pomodoro ─────────────────────────────────────────────────────────────
  const [timerType,  setTimerType]  = useState<'pomodoro'|'free'>('pomodoro');
  const [workMins,   setWorkMins]   = useState(25);
  const [breakMins,  setBreakMins]  = useState(5);
  const [freeMins,   setFreeMins]   = useState(30);
  const [pomMode,    setPomMode]    = useState<'work'|'break'>('work');
  const [pomSecs,    setPomSecs]    = useState(WORK_SECS);
  const [pomRunning, setPomRunning] = useState(false);
  const [pomCount,   setPomCount]   = useState(0);
  const pomRef       = useRef<ReturnType<typeof setInterval>|null>(null);
  const msRef        = useRef<ReturnType<typeof setInterval>|null>(null);
  const timeTextRef  = useRef<HTMLDivElement>(null);
  const msDisplayRef = useRef<HTMLSpanElement>(null);
  const timerCardRef = useRef<HTMLDivElement>(null);
  const progressRef  = useRef<HTMLDivElement>(null);
  // Keep a live ref to settings so the tick closure never goes stale
  const settingsRef  = useRef({ timerType, workMins, breakMins, freeMins, pomMode });
  settingsRef.current = { timerType, workMins, breakMins, freeMins, pomMode };

  // Animate text color whenever run/pause/mode changes
  useEffect(() => {
    if (!timeTextRef.current) return;
    const color = pomRunning ? (pomMode === 'work' ? COLOR_WORK : COLOR_BREAK) : COLOR_IDLE;
    animate(timeTextRef.current, { color, duration: 350, ease: 'outQuad' });
  }, [pomRunning, pomMode]);

  // Tick
  useEffect(() => {
    if (pomRunning) {
      pomRef.current = setInterval(() => {
        setPomSecs(s => {
          if (s <= 1) {
            clearInterval(pomRef.current!);
            setPomRunning(false);
            const { timerType: tt, workMins: wm, breakMins: bm, freeMins: fm, pomMode: pm } = settingsRef.current;
            // Completion animations
            if (timeTextRef.current) animate(timeTextRef.current, { color: [COLOR_DONE, COLOR_IDLE], scale: [{ to: 1.04, duration: 120 }, { to: 1, duration: 400 }], duration: 800, ease: 'outElastic(1, .5)' });
            if (timerCardRef.current) animate(timerCardRef.current, { backgroundColor: ['rgba(234,84,85,0.15)', '#091413'], duration: 700, ease: 'outQuad' });
            if (tt === 'free') {
              setPomSecs(fm * 60);
            } else {
              const next = pm === 'work' ? 'break' : 'work';
              if (pm === 'work') setPomCount(c => c + 1);
              setPomMode(next);
              setPomSecs(next === 'work' ? wm * 60 : bm * 60);
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (pomRef.current) clearInterval(pomRef.current);
    }
    return () => { if (pomRef.current) clearInterval(pomRef.current); };
  }, [pomRunning]);

  // Animate progress bar
  useEffect(() => {
    if (!progressRef.current) return;
    const total = timerType === 'free' ? freeMins * 60 : pomMode === 'work' ? workMins * 60 : breakMins * 60;
    const pct   = total > 0 ? ((total - pomSecs) / total) * 100 : 0;
    animate(progressRef.current, { width: `${pct}%`, duration: 950, ease: 'linear' });
  }, [pomSecs, pomMode, timerType, workMins, breakMins, freeMins]);

  // Millisecond display — direct DOM write, no React re-render
  useEffect(() => {
    let count = 0;
    if (pomRunning) {
      msRef.current = setInterval(() => {
        count = (count + 1) % 100;
        if (msDisplayRef.current) {
          msDisplayRef.current.textContent = '.' + String(count).padStart(2, '0');
        }
      }, 10);
    } else {
      if (msRef.current) clearInterval(msRef.current);
      if (msDisplayRef.current) msDisplayRef.current.textContent = '.00';
    }
    return () => { if (msRef.current) clearInterval(msRef.current); };
  }, [pomRunning]);

  // Reset displayed time when user changes duration settings (only while stopped)
  useEffect(() => {
    if (pomRunning) return;
    const newTotal = timerType === 'free' ? freeMins * 60 : pomMode === 'work' ? workMins * 60 : breakMins * 60;
    setPomSecs(newTotal);
  }, [timerType, workMins, breakMins, freeMins]);

  const togglePom = () => {
    if (!pomRunning && timeTextRef.current) {
      // brief "arm" flash before starting
      animate(timeTextRef.current, {
        color: [COLOR_DONE, pomMode === 'work' ? COLOR_WORK : COLOR_BREAK],
        scale: [{ to: 0.97, duration: 80 }, { to: 1, duration: 200 }],
        duration: 280,
        ease: 'outBack(2)',
      });
    }
    setPomRunning(r => !r);
  };

  const resetPom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPomRunning(false);
    setPomMode('work');
    setPomCount(0);
    const newTotal = timerType === 'free' ? freeMins * 60 : workMins * 60;
    setPomSecs(newTotal);
    if (timeTextRef.current) animate(timeTextRef.current, { color: COLOR_IDLE, duration: 300 });
  };

  const switchMode = (m: 'work'|'break', e: React.MouseEvent) => {
    e.stopPropagation();
    setPomRunning(false);
    setPomMode(m);
    setPomSecs(m === 'work' ? workMins * 60 : breakMins * 60);
  };

  const clampMins = (v: number) => Math.min(99, Math.max(1, v));
  const adjustMins = (setter: (v: number) => void, current: number, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setter(clampMins(current + delta));
  };

  const pomM = String(Math.floor(pomSecs / 60)).padStart(2, '0');
  const pomS = String(pomSecs % 60).padStart(2, '0');
  const currentTotal     = timerType === 'free' ? freeMins * 60 : pomMode === 'work' ? workMins * 60 : breakMins * 60;
  const progressPctTimer = currentTotal > 0 ? ((currentTotal - pomSecs) / currentTotal) * 100 : 0;
  const atStart          = pomSecs === currentTotal;
  const statusLabel      = pomRunning
    ? (timerType === 'free' ? 'RUNNING' : pomMode === 'work' ? 'FOCUS' : 'BREAK')
    : atStart ? 'TAP TO START' : 'PAUSED';

  // ── Schedule / task data ─────────────────────────────────────────────────
  const todayTimeline = [
    ...events.filter(e => e.recurring ? e.day === todayName : e.date === todayStr).map(e => ({
      id: e.id, dbId: e.id, title: e.title, type: 'fixed' as const, color: e.color,
      category: e.type, start: `${todayStr}T${e.startTime}:00`,
      end: `${todayStr}T${e.endTime}:00`, completed: false,
    })),
    ...sessions.filter(s => {
      // Compare only date part
      return s.start.split('T')[0] === todayStr;
    }).map(s => {
      const t = tasks.find(t => t.id === s.taskId);
      return { id: s.id, dbId: s.taskId, title: s.taskTitle, type: 'study' as const,
        color: t?.color || '#EA5455', category: t?.category || 'task',
        start: s.start, end: s.end, completed: s.completed };
    }),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const toMins = (iso: string) => {
    const timePart = iso.split('T')[1];
    if (!timePart) return 0;
    const [h, m] = timePart.split(':').map(Number);
    return h * 60 + m;
  };

  // Stacking logic for timeline
  const timelineWithLanes = todayTimeline.reduce((acc: any[], item) => {
    const s = toMins(item.start);
    const ie = toMins(item.end);
    let lane = 0;
    while (acc.some(other => {
      if (other.lane !== lane) return false;
      const os = toMins(other.start);
      const oe = toMins(other.end);
      return (s < oe && os < ie);
    })) {
      lane++;
    }
    acc.push({ ...item, lane });
    return acc;
  }, []);
  const maxLane = Math.max(-1, ...timelineWithLanes.map(i => i.lane));

  const todaySessions = todayTimeline.filter(i => i.type === 'study');
  const nextItem  = todayTimeline.find(i => {
    const itemMins = toMins(i.start);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return itemMins > nowMins && !i.completed;
  });
  const nextMins = nextItem ? toMins(nextItem.start) - (now.getHours() * 60 + now.getMinutes()) : null;
  const nextLabel = nextItem
    ? (nextMins! <= 0 ? 'Now' : nextMins! < 60 ? `${nextMins}m` : `${Math.round(nextMins!/60)}h`)
    : todaySessions.length > 0 ? 'Done' : '—';

  const overdue = tasks.filter(t => t.status !== 'completed' && t.hasDeadline && t.deadline && t.deadline < todayStr);

  const activeTasks = tasks
    .filter(t => t.status !== 'completed')
    .map(t => ({ ...t, score: calculatePriorityScore(t, now) }))
    .sort((a, b) => b.score - a.score);

  const upcomingDeadlines = [...activeTasks].filter(t => t.hasDeadline)
    .sort((a, b) => {
       if (a.deadline === b.deadline) return 0;
       return a.deadline! < b.deadline! ? -1 : 1;
    });

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weekSess     = sessions.filter(s => parseLocalISO(s.start) >= weekStart);
  const weekDone     = weekSess.filter(s => s.completed);
  const weekHrs      = weekDone.reduce((s, x) => s + (parseLocalISO(x.end).getTime() - parseLocalISO(x.start).getTime()) / 3600000, 0);
  const weekRate     = weekSess.length > 0 ? Math.round((weekDone.length / weekSess.length) * 100) : 0;
  const weekTasksDone = tasks.filter(t => t.status === 'completed').length;

  // Mini schedule helpers
  const DAY_MINS = (DAY_END - DAY_START) * 60;
  const pct      = (m: number) => Math.min(100, Math.max(0, ((m - DAY_START*60) / DAY_MINS) * 100));
  const nowPct   = pct(now.getHours() * 60 + now.getMinutes());

  // Inspector
  let insp: any = null;
  if (sel) {
    if (sel.type === 'fixed') {
      const ev = events.find(e => e.id === sel.dbId);
      if (ev) insp = { title: ev.title, category: ev.type, timeRange: `${ev.recurring ? ev.day : fmtDate(ev.date)} • ${ev.startTime}–${ev.endTime}`, notes: ev.notes || '', subtasks: [], color: ev.color, priority: null };
    } else {
      const s = sessions.find(s => s.id === sel.id);
      const t = tasks.find(t => t.id === sel.dbId);
      if (s && t) {
        const a = parseLocalISO(s.start), b = parseLocalISO(s.end);
        const ot: Intl.DateTimeFormatOptions = { hour:'2-digit', minute:'2-digit', hour12:false };
        insp = { title: t.title, category: t.category, timeRange: `${a.toLocaleDateString([],{month:'short',day:'numeric'})} • ${a.toLocaleTimeString([],ot)}–${b.toLocaleTimeString([],ot)}`, notes: t.notes || '', subtasks: t.subtasks || [], color: t.color, priority: t.priority };
      }
    }
  }

  function fmtDate(d?: string) { if(!d) return '?'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y.slice(-2)}`; }
  function prioEmoji(p: string) { return p==='high'?'🔥':p==='medium'?'💓':'🛌'; }
  function catEmoji(c: string) { switch(c){case 'assignment':return'📝';case 'quiz':return'❓';case 'program':return'💻';case 'date':return'📅';case 'training':return'💪';default:return'•';} }
  function fmtRange(a:string,b:string){const f=(d:Date)=>d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});return`${f(new Date(a))} – ${f(new Date(b))}`;}

  const toggleSub = async (subId: string) => {
    if (!sel || sel.type !== 'study') return;
    const t = tasks.find(t => t.id === sel.dbId);
    if (!t) return;
    await onUpdateTask(t.id, { subtasks: (t.subtasks||[]).map(s => s.id===subId ? {...s,completed:!s.completed} : s) });
  };
  const addSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subText.trim() || !sel || sel.type !== 'study') return;
    const t = tasks.find(t => t.id === sel.dbId);
    if (!t) return;
    await onUpdateTask(t.id, { subtasks: [...(t.subtasks||[]), {id:`sub-${Date.now()}`,text:subText.trim(),completed:false}] });
    setSubText('');
  };
  const saveNote = async () => {
    if (!sel) return;
    if (sel.type === 'study') await onUpdateTask(sel.dbId, { notes: noteText });
    else await onUpdateEvent(sel.dbId, { notes: noteText });
    setEditingNote(false);
  };
  const delSel = async () => {
    if (!sel) return;
    if (!window.confirm(`Delete this ${sel.type === 'study' ? 'task' : 'event'}?`)) return;
    if (sel.type === 'study') await onDeleteTask(sel.dbId);
    else await onDeleteEvent(sel.dbId);
    setSel(null);
  };
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    await onAddTodo(newTodo.trim());
    setNewTodo('');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem', maxWidth:'100%', overflowX:'hidden', paddingBottom:'100px' }}>

      {/* ══ TIMER HERO ══════════════════════════════════════════════════════ */}
      <div
        ref={timerCardRef}
        onClick={togglePom}
        style={{
          backgroundColor: '#091413',
          borderRadius: 'var(--border-radius-lg)',
          border: '1px solid #285A48',
          padding: '1.75rem 1.75rem 0',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Top row: type toggle + session count + reset */}
        <div style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }} onClick={e => e.stopPropagation()}>
          {/* Timer type toggle */}
          <div style={{ display:'flex', gap:'0', backgroundColor:'rgba(176,228,204,0.05)', borderRadius:'4px', padding:'2px' }}>
            {(['pomodoro','free'] as const).map(t => (
              <button key={t} onClick={e => { e.stopPropagation(); setTimerType(t); setPomRunning(false); }}
                style={{ padding:'3px 12px', borderRadius:'4px', border:'none', fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', cursor:'pointer', backgroundColor: timerType===t ? 'rgba(176,228,204,0.12)' : 'transparent', color: timerType===t ? '#B0E4CC' : 'rgba(176,228,204,0.35)', transition:'all 0.2s' }}>
                {t === 'pomodoro' ? 'Pomodoro' : 'Free'}
              </button>
            ))}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            {timerType === 'pomodoro' && pomCount > 0 && (
              <span style={{ fontSize:'0.68rem', color:'rgba(176,228,204,0.4)', letterSpacing:'0.04em' }}>
                {pomCount} done
              </span>
            )}
            <button onClick={resetPom} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(176,228,204,0.3)', padding:'4px', display:'flex', transition:'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#B0E4CC')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(176,228,204,0.3)')}>
              <RotateCcw size={14}/>
            </button>
          </div>
        </div>

        {/* Pomodoro-only: work/break mode tabs */}
        {timerType === 'pomodoro' && (
          <div style={{ display:'flex', gap:'0.3rem', marginBottom:'0.5rem' }} onClick={e => e.stopPropagation()}>
            {(['work','break'] as const).map(m => (
              <button key={m} onClick={e => switchMode(m, e)}
                style={{ padding:'2px 10px', borderRadius:'4px', border:'none', fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', cursor:'pointer', backgroundColor: pomMode===m ? 'rgba(176,228,204,0.1)' : 'transparent', color: pomMode===m ? '#B0E4CC' : 'rgba(176,228,204,0.3)', transition:'all 0.2s' }}>
                {m === 'work' ? 'Focus' : 'Break'}
              </button>
            ))}
          </div>
        )}

        {/* THE TIME */}
        <div
          ref={timeTextRef}
          style={{ fontFamily:"'DS-Digital', monospace", fontSize:'clamp(5.5rem, 22vw, 11rem)', fontWeight:400, letterSpacing:'0.02em', lineHeight:1, color:COLOR_IDLE, transition:'none', display:'flex', alignItems:'baseline' }}
        >
          <span>{pomM}:{pomS}</span>
          <span ref={msDisplayRef} style={{ fontSize:'0.45em', opacity:0.8, letterSpacing:0, marginLeft:'0.08em' }}>.00</span>
        </div>

        {/* Status label */}
        <div style={{ marginTop:'0.75rem', fontSize:'0.62rem', letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(176,228,204,0.35)', fontFamily:'var(--font-mono)' }}>
          {statusLabel}
        </div>

        {/* Duration controls — shown when not running */}
        {!pomRunning && (
          <div style={{ display:'flex', gap:'0.6rem', marginTop:'1rem', marginBottom:'0.25rem', flexWrap:'wrap', justifyContent:'center' }} onClick={e => e.stopPropagation()}>
            {timerType === 'pomodoro' ? (
              <>
                <DurationPill label="Work" value={workMins} onDec={e => adjustMins(setWorkMins, workMins, -1, e)} onInc={e => adjustMins(setWorkMins, workMins, 1, e)} />
                <DurationPill label="Break" value={breakMins} onDec={e => adjustMins(setBreakMins, breakMins, -1, e)} onInc={e => adjustMins(setBreakMins, breakMins, 1, e)} />
              </>
            ) : (
              <DurationPill label="Duration" value={freeMins} onDec={e => adjustMins(setFreeMins, freeMins, -5, e)} onInc={e => adjustMins(setFreeMins, freeMins, 5, e)} step={5} />
            )}
          </div>
        )}

        {/* Spacer when running */}
        {pomRunning && <div style={{ height:'1.25rem' }} />}

        {/* Progress bar */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', backgroundColor:'rgba(176,228,204,0.08)' }}>
          <div ref={progressRef} style={{ height:'100%', width:`${progressPctTimer}%`, backgroundColor: timerType==='free' ? COLOR_BREAK : pomMode==='work' ? COLOR_WORK : COLOR_BREAK, opacity:0.7, borderRadius:'0 2px 2px 0' }}/>
        </div>
      </div>

      {/* ══ MINI SCHEDULE ═══════════════════════════════════════════════════ */}
      <div className="card" style={{ padding:'1rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', color:'var(--text-primary)', fontWeight:600, fontSize:'0.9rem' }}>
            <CalendarDays size={16} className="logo-icon"/>
            <span>{todayName}</span>
            <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:'0.78rem', marginLeft:'0.2rem' }}>{now.toLocaleDateString([],{month:'short',day:'numeric'})}</span>
          </div>
          <button onClick={onOpenSchedule} className="btn btn-secondary" style={{ padding:'4px 12px', fontSize:'0.75rem' }}>Full view</button>
        </div>
        <div style={{ position:'relative', height: `${Math.max(40, (maxLane + 1) * 20)}px`, backgroundColor:'rgba(176,228,204,0.05)', borderRadius:'4px', overflow:'hidden', transition: 'height 0.3s' }}>
          {[8,10,12,14,16,18,20,22].map(h => (
            <div key={h} style={{ position:'absolute', left:`${pct(h*60)}%`, top:0, bottom:0, width:'1px', backgroundColor:'rgba(176,228,204,0.1)' }}>
              <span style={{ position:'absolute', top:'2px', left:'2px', fontSize:'9px', color:'var(--text-muted)' }}>{h}</span>
            </div>
          ))}
          {timelineWithLanes.map(item => {
            const s = pct(toMins(item.start)), e = pct(toMins(item.end));
            const w = Math.max(e - s, 1.5);
            return (
              <div key={item.id} title={item.title} onClick={() => setSel({ type:item.type, id:item.id, dbId:item.dbId, title:item.title, category:item.type==='fixed'?'fixed event':'study block', start:item.start, end:item.end, completed:item.completed })}
                style={{ 
                  position:'absolute', 
                  left:`${s}%`, 
                  width:`${w}%`, 
                  top: `${item.lane * (100 / (maxLane + 1)) + 5}%`, 
                  height: `${(100 / (maxLane + 1)) - 10}%`,
                  backgroundColor: item.completed ? 'rgba(52,211,153,0.4)' : item.color+'cc', 
                  borderRadius:'4px', 
                  cursor:'pointer', 
                  minWidth:'6px' 
                }}
              />
            );
          })}
          {nowPct > 0 && nowPct < 100 && (
            <div style={{ position:'absolute', left:`${nowPct}%`, top:0, bottom:0, width:'2px', backgroundColor:'var(--primary)', opacity:0.8, borderRadius:'1px' }}/>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:'4px', fontSize:'0.68rem', color:'var(--text-muted)' }}>
          <span>07:00</span><span>23:00</span>
        </div>
      </div>

      {/* ══ DAILY PROGRESS ══════════════════════════════════════════════════ */}
      <div className="card" style={{ padding:'0.9rem 1.1rem', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        <div style={{ paddingLeft:'0.75rem' }}>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginBottom:'0.25rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Next</div>
          {nextItem
            ? <div style={{ display:'flex', alignItems:'center', gap:'0.25rem' }}>
                <span style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'80px' }}>{nextItem.title}</span>
                <ArrowRight size={11} color="var(--text-muted)"/>
                <span style={{ fontSize:'0.7rem', color:'var(--accent)', whiteSpace:'nowrap' }}>{nextLabel}</span>
              </div>
            : <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{nextLabel}</span>
          }
        </div>
        <div style={{ borderLeft:'1px solid var(--border-color)', paddingLeft:'0.75rem' }}>
          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginBottom:'0.25rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Overdue</div>
          {overdue.length === 0
            ? <span style={{ fontSize:'0.8rem', color:'#34d399' }}>None</span>
            : <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <AlertCircle size={13} color="#f87171"/>
                <span style={{ fontSize:'1rem', fontWeight:700, color:'#f87171' }}>{overdue.length}</span>
              </div>
          }
        </div>
      </div>

      {/* ══ INSPECTOR ═══════════════════════════════════════════════════════ */}
      {sel && insp && (
        <div className="card" style={{ border:`1.5px solid ${insp.color}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1px solid var(--border-color)', paddingBottom:'0.7rem', marginBottom:'1rem' }}>
            <div>
              <span style={{ fontSize:'0.6rem', padding:'2px 7px', borderRadius:'4px', textTransform:'uppercase', fontWeight:700, backgroundColor:`${insp.color}22`, color:insp.color }}>{insp.category}</span>
              <h3 style={{ margin:'5px 0 0', color:'var(--text-primary)', fontSize:'1.1rem' }}>{insp.title} {insp.priority && prioEmoji(insp.priority)}</h3>
              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', color:'var(--text-secondary)', fontSize:'0.78rem', marginTop:'5px' }}>
                <Clock size={13}/><span>{insp.timeRange}</span>
              </div>
            </div>
            <button onClick={() => setSel(null)} className="btn btn-secondary" style={{ padding:'5px 10px', fontSize:'0.7rem' }}>Close</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.85rem', fontWeight:600, color:'var(--text-primary)' }}><FileText size={14}/> Notes</div>
                <button onClick={() => { if(editingNote) saveNote(); else { setNoteText(insp.notes); setEditingNote(true); } }} className="btn btn-secondary" style={{ padding:'3px 9px', fontSize:'0.68rem' }}>{editingNote ? 'Save' : 'Edit'}</button>
              </div>
              {editingNote
                ? <textarea className="form-control" style={{ width:'100%', minHeight:'70px', fontSize:'0.85rem', boxSizing:'border-box' }} value={noteText} onChange={e => setNoteText(e.target.value)}/>
                : <div style={{ backgroundColor:'rgba(0,0,0,0.25)', padding:'0.75rem', borderRadius:'4px', fontSize:'0.85rem', color:'var(--text-secondary)', whiteSpace:'pre-wrap', lineHeight:1.5 }}>{insp.notes || 'No notes.'}</div>
              }
            </div>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <button onClick={onOpenManager} className="btn btn-primary" style={{ flex:1, padding:'9px', fontSize:'0.82rem' }}>Edit</button>
              <button onClick={delSel} className="btn btn-danger" style={{ flex:1, padding:'9px', fontSize:'0.82rem' }}>Delete</button>
            </div>
            {sel.type === 'study' && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.85rem', fontWeight:600, color:'var(--text-primary)', marginBottom:'0.6rem' }}><CheckSquare size={14}/> Checklist</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {insp.subtasks.map((st: any) => (
                    <div key={st.id} onClick={() => toggleSub(st.id)} style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.85rem', cursor:'pointer', padding:'3px' }}>
                      {st.completed ? <CheckSquare size={16} color="#34d399"/> : <Square size={16} color="var(--text-muted)"/>}
                      <span style={{ textDecoration:st.completed?'line-through':'none', color:st.completed?'var(--text-muted)':'var(--text-primary)' }}>{st.text}</span>
                    </div>
                  ))}
                  <form onSubmit={addSub} style={{ display:'flex', gap:'6px', marginTop:'4px' }}>
                    <input type="text" className="form-control" placeholder="Add item…" value={subText} onChange={e => setSubText(e.target.value)} style={{ flex:1, padding:'7px 10px', fontSize:'0.82rem' }}/>
                    <button type="submit" className="btn btn-primary" style={{ padding:'7px 14px', fontSize:'0.82rem' }}>Add</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TODAY'S SCHEDULE ════════════════════════════════════════════════ */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><Clock className="logo-icon" size={18}/><h3>Today</h3></div>
          <span style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{todayName}</span>
        </div>
        {todayTimeline.length === 0
          ? <p style={{ textAlign:'center', padding:'2rem', color:'var(--text-secondary)', fontSize:'0.85rem' }}>Nothing scheduled today.</p>
          : <div className="timeline">
              {todayTimeline.map(item => {
                const isStudy = item.type === 'study';
                const dur = (new Date(item.end).getTime() - new Date(item.start).getTime()) / 3600000;
                return (
                  <div key={item.id} className="timeline-item" style={{ gap:'0.75rem' }}>
                    <div className="timeline-time" style={{ width:'72px', fontSize:'0.72rem' }}>{fmtRange(item.start,item.end)}</div>
                    <div className="timeline-marker"><div className="timeline-dot" style={{ backgroundColor:item.color }}/><div className="timeline-line"/></div>
                    <div className="timeline-content">
                      <div className="timeline-card" style={{ borderLeft:`3px solid ${item.color}`, padding:'0.6rem 0.9rem' }}>
                        <div style={{ flex:1, cursor:'pointer' }} onClick={() => setSel({ type:item.type, id:item.id, dbId:item.dbId, title:item.title, category:isStudy?'study block':'fixed event', start:item.start, end:item.end, completed:item.completed })}>
                          <div style={{ fontWeight:600, color:'var(--text-primary)', fontSize:'0.88rem' }}>{catEmoji(item.category)} {item.title}</div>
                          <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', marginTop:'2px' }}>{dur.toFixed(1)}h • {item.category}</div>
                        </div>
                        {isStudy && (
                          <button onClick={() => onToggleSession(item.id,!item.completed,dur,item.dbId)} className="btn" style={{ padding:'5px 10px', fontSize:'0.7rem', backgroundColor:item.completed?'rgba(52,211,153,0.1)':'transparent', border:'1px solid var(--border-color)', color:item.completed?'#34d399':'#fff' }}>
                            <CheckCircle2 size={13}/>
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

      {/* ══ TASKS & DEADLINES ═══════════════════════════════════════════════ */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title"><Star size={18} className="logo-icon"/><h3>Priorities</h3></div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
            {activeTasks.length === 0
              ? <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', textAlign:'center', padding:'0.75rem' }}>No active tasks.</p>
                : activeTasks.slice(0,3).map(t => (
                  <div key={t.id} style={{ padding:'0.85rem', backgroundColor:'rgba(176,228,204,0.03)', borderRadius:'5px', border:'1px solid var(--border-color)', borderLeft:`3px solid ${t.color}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                      <span style={{ fontWeight:600, fontSize:'0.85rem', color:'var(--text-primary)' }}>{catEmoji(t.category)} {t.title}</span>
                      <span>{prioEmoji(t.priority)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'flex-end', fontSize:'0.68rem', marginTop:'5px', color:'var(--text-secondary)' }}>
                      <span>{t.hasDeadline ? fmtDate(t.deadline) : 'No deadline'}</span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
        <div className="card">
          <div className="card-title"><Bookmark size={18} className="logo-icon"/><h3>Deadlines</h3></div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
            {overdue.length > 0 && <>
              <div style={{ fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'#f87171', fontWeight:700, display:'flex', alignItems:'center', gap:'0.25rem' }}>
                <AlertCircle size={10}/> Overdue
              </div>
              {overdue.map(t => (
                <div key={t.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.45rem 0.55rem', borderRadius:'4px', backgroundColor:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.15)' }}>
                  <span style={{ color:'#fca5a5' }}>{catEmoji(t.category)} {t.title}</span>
                  <span style={{ color:'#f87171', fontWeight:700 }}>{fmtDate(t.deadline)}</span>
                </div>
              ))}
              {upcomingDeadlines.length > 0 && <div style={{ height:'1px', backgroundColor:'var(--border-color)' }}/>}
            </>}
            {upcomingDeadlines.length === 0 && overdue.length === 0
              ? <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', textAlign:'center', padding:'0.75rem' }}>No upcoming deadlines.</p>
              : upcomingDeadlines.slice(0,5).map(t => (
                  <div key={t.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.5rem 0', borderBottom:'1px solid var(--border-color)' }}>
                    <span style={{ color:'var(--text-primary)' }}>{catEmoji(t.category)} {t.title}</span>
                    <span style={{ color:t.color, fontWeight:700 }}>{fmtDate(t.deadline)}</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* ══ WEEKLY STATS ════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="card-title"><BarChart2 size={18} className="logo-icon"/><h3>This Week</h3></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.75rem' }}>
          {[
            { label:'Sessions', value:`${weekDone.length}/${weekSess.length}` },
            { label:'Hours',    value:`${weekHrs.toFixed(1)}h` },
            { label:'Rate',     value:`${weekRate}%` },
            { label:'Done',     value:`${weekTasksDone}` },
          ].map(s => (
            <div key={s.label} style={{ padding:'0.85rem', backgroundColor:'rgba(176,228,204,0.03)', borderRadius:'4px', border:'1px solid var(--border-color)', textAlign:'center' }}>
              <div style={{ fontSize:'0.58rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.2rem' }}>{s.label}</div>
              <div style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ QUICK TO-DO ══════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="card-title" style={{ justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><ListTodo size={18} className="logo-icon"/><h3>To-Do</h3></div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{todos.filter(t=>t.done).length}/{todos.length}</span>
            {todos.some(t=>t.done) && <button onClick={onClearDoneTodos} className="btn btn-secondary" style={{ padding:'3px 9px', fontSize:'0.7rem' }}>Clear</button>}
          </div>
        </div>
        <form onSubmit={handleAddTodo} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.85rem' }}>
          <input type="text" className="form-control" placeholder="Add a to-do…" value={newTodo} onChange={e => setNewTodo(e.target.value)} style={{ flex:1, padding:'8px 11px', fontSize:'0.88rem' }}/>
          <button type="submit" className="btn btn-primary" style={{ padding:'8px 14px', fontSize:'0.82rem' }}>Add</button>
        </form>
        {todos.length === 0
          ? <p style={{ textAlign:'center', padding:'1.25rem', color:'var(--text-muted)', fontSize:'0.82rem' }}>Nothing here yet.</p>
          : <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem' }}>
              {todos.map(todo => (
                <div key={todo.id} style={{ display:'flex', alignItems:'center', gap:'0.65rem', padding:'0.6rem 0.75rem', borderRadius:'4px', backgroundColor:todo.done?'transparent':'rgba(176,228,204,0.04)', border:'1px solid var(--border-color)' }}>
                  <button onClick={() => onToggleTodo(todo.id,!todo.done)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:todo.done?'#34d399':'var(--text-muted)', display:'flex', flexShrink:0 }}>
                    {todo.done ? <CheckCircle2 size={17}/> : <Square size={17}/>}
                  </button>
                  <span style={{ flex:1, fontSize:'0.88rem', color:todo.done?'var(--text-muted)':'var(--text-primary)', textDecoration:todo.done?'line-through':'none' }}>{todo.text}</span>
                  <button onClick={() => onDeleteTodo(todo.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'var(--text-muted)', display:'flex', opacity:0.5 }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>
        }
      </div>

      {/* ══ FAB ══════════════════════════════════════════════════════════════ */}
      <div style={{ position:'fixed', bottom:'calc(24px + env(safe-area-inset-bottom))', right:'20px', zIndex:500, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'10px' }}>
        {fabOpen && (
          <>
            {[
              { label:'Add Task',  onClick: onOpenManager },
              { label:'Add Class', onClick: onOpenManager },
              { label:'Manage',    onClick: onOpenManager },
            ].map((item,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <span style={{ backgroundColor:'#111111', color:'#fff', padding:'4px 10px', borderRadius:'4px', fontSize:'0.78rem', fontWeight:500, border:'none' }}>{item.label}</span>
                <button onClick={() => { item.onClick(); setFabOpen(false); }} className="btn btn-secondary" style={{ width:'40px', height:'40px', borderRadius:'50%', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Plus size={16}/>
                </button>
              </div>
            ))}
          </>
        )}
        <button onClick={() => setFabOpen(o=>!o)} style={{ width:'52px', height:'52px', borderRadius:'50%', backgroundColor:'var(--primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(234,84,85,0.4)', transform: fabOpen?'rotate(45deg)':'rotate(0deg)', transition:'transform 0.2s' }}>
          {fabOpen ? <X size={22} color="#fff"/> : <Plus size={22} color="#fff"/>}
        </button>
      </div>

    </div>
  );
};
