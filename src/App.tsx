import { useState, useEffect } from 'react';
import { dbService } from './services/db';
import type { Task, FixedEvent, StudySession, UserPreferences, UserProfile, Todo } from './services/db';
import { generateSchedule } from './services/scheduler';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { ScheduleView } from './components/ScheduleView';
import { ScheduleManager } from './components/ScheduleManager';
import { Bell, LogOut, X, CalendarDays, Calendar as CalendarIcon } from 'lucide-react';

interface InAppNotification {
  id: string; title: string; message: string; time: string; read: boolean;
}

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'schedule'>('dashboard');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FixedEvent[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [conflictedTaskIds, setConflictedTaskIds] = useState<string[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);

  const [showManager, setShowManager] = useState(false);
  const [editingItem] = useState<{ type: 'task' | 'event'; id: string } | null>(null);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const unsub = dbService.onAuthStateChanged((profile) => {
      setUser(profile);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user) loadUserData();
  }, [user]);

  useEffect(() => {
    if (!user || tasks.length === 0 || sessions.length === 0) return;
    const check = () => {
      const now = new Date();
      const notifs: InAppNotification[] = [];
      sessions.forEach(s => {
        if (s.completed) return;
        const diff = (new Date(s.start).getTime() - now.getTime()) / 60000;
        if (diff > 0 && diff <= 15) notifs.push({ id: `s-${s.id}`, title: 'Upcoming Session', message: `"${s.taskTitle}" starts in ${Math.ceil(diff)} min`, time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false });
      });
      tasks.forEach(t => {
        if (t.status === 'completed') return;
        const diff = (new Date(t.deadline + 'T23:59:59').getTime() - now.getTime()) / 3600000;
        if (diff > 0 && diff <= 24) notifs.push({ id: `d-${t.id}`, title: 'Deadline Warning', message: `"${t.title}" due in ${Math.ceil(diff)}h`, time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false });
      });
      if (notifs.length) setNotifications(prev => [...notifs, ...prev.filter(p => !notifs.some(n => n.id === p.id))]);
    };
    check();
    const iv = setInterval(check, 120000);
    return () => clearInterval(iv);
  }, [user, tasks, sessions]);

  const loadUserData = async () => {
    if (!user) return;
    const [prefs, fetchedTasks, fetchedEvents, fetchedSessions, fetchedTodos] = await Promise.all([
      dbService.getPreferences(user.uid),
      dbService.getTasks(user.uid),
      dbService.getEvents(user.uid),
      dbService.getSessions(user.uid),
      dbService.getTodos(user.uid, todayStr),
    ]);
    setPreferences(prefs);
    setTasks(fetchedTasks);
    setEvents(fetchedEvents);
    setTodos(fetchedTodos);
    if (fetchedSessions.length === 0 && fetchedTasks.length > 0) {
      const r = generateSchedule(fetchedTasks, fetchedEvents, prefs);
      await dbService.saveSessions(user.uid, r.sessions);
      setSessions(r.sessions);
      setConflictedTaskIds(r.conflictedTaskIds);
    } else {
      setSessions(fetchedSessions);
      setConflictedTaskIds(generateSchedule(fetchedTasks, fetchedEvents, prefs).conflictedTaskIds);
    }
  };

  const recalc = async (t: Task[], e: FixedEvent[], p: UserPreferences, silent = false) => {
    if (!user) return;
    const r = generateSchedule(t, e, p);
    await dbService.saveSessions(user.uid, r.sessions);
    setSessions(r.sessions);
    setConflictedTaskIds(r.conflictedTaskIds);
    if (!silent) setNotifications(prev => [{ id: `sc-${Date.now()}`, title: 'Schedule Updated', message: 'Schedule recalculated.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), read: false }, ...prev]);
  };

  const handleLogout = async () => {
    await dbService.logout();
    setUser(null); setTasks([]); setEvents([]); setSessions([]); setPreferences(null); setNotifications([]); setTodos([]);
  };

  const handleAddTask = async (task: Omit<Task, 'id'>) => {
    if (!user || !preferences) return;
    const t = await dbService.addTask(user.uid, task);
    const updated = [...tasks, t];
    setTasks(updated);
    await recalc(updated, events, preferences);
  };

  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    if (!user || !preferences) return;
    await dbService.updateTask(user.uid, id, updates);
    const updated = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
    setTasks(updated);
    await recalc(updated, events, preferences, true);
  };

  const handleDeleteTask = async (id: string) => {
    if (!user || !preferences) return;
    await dbService.deleteTask(user.uid, id);
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    await recalc(updated, events, preferences);
  };

  const handleAddEvent = async (event: Omit<FixedEvent, 'id'>) => {
    if (!user || !preferences) return;
    const e = await dbService.addEvent(user.uid, event);
    const updated = [...events, e];
    setEvents(updated);
    await recalc(tasks, updated, preferences);
  };

  const handleUpdateEvent = async (id: string, updates: Partial<FixedEvent>) => {
    if (!user || !preferences) return;
    await dbService.updateEvent(user.uid, id, updates);
    const updated = events.map(e => e.id === id ? { ...e, ...updates } : e);
    setEvents(updated);
    await recalc(tasks, updated, preferences, true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!user || !preferences) return;
    await dbService.deleteEvent(user.uid, id);
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    await recalc(tasks, updated, preferences);
  };

  const handleSavePreferences = async (prefs: UserPreferences) => {
    if (!user) return;
    await dbService.savePreferences(user.uid, prefs);
    setPreferences(prefs);
    await recalc(tasks, events, prefs);
  };

  const handleToggleSession = async (sessionId: string, completed: boolean, hours: number, taskId: string) => {
    if (!user || !preferences) return;
    await dbService.toggleSessionComplete(user.uid, sessionId, completed, hours, taskId);
    const [ft, fs] = await Promise.all([dbService.getTasks(user.uid), dbService.getSessions(user.uid)]);
    setTasks(ft); setSessions(fs);
    setConflictedTaskIds(generateSchedule(ft, events, preferences).conflictedTaskIds);
  };

  // Todo handlers
  const handleAddTodo = async (text: string) => {
    if (!user) return;
    const todo = await dbService.addTodo(user.uid, text, todayStr);
    setTodos(prev => [...prev, todo]);
  };
  const handleToggleTodo = async (id: string, done: boolean) => {
    if (!user) return;
    await dbService.toggleTodo(user.uid, id, done);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done } : t));
  };
  const handleDeleteTodo = async (id: string) => {
    if (!user) return;
    await dbService.deleteTodo(user.uid, id);
    setTodos(prev => prev.filter(t => t.id !== id));
  };
  const handleClearDoneTodos = async () => {
    if (!user) return;
    await dbService.clearDoneTodos(user.uid, todayStr);
    setTodos(prev => prev.filter(t => !t.done));
  };

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const unread = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#080b11' }}>
        <div style={{ textAlign: 'center' }}>
          <CalendarDays className="logo-icon animate-pulse" size={48} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '1rem', color: '#fff' }}>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user || !preferences) return <Auth onAuthSuccess={setUser} />;

  return (
    <div className="app-container">
      <main className="main-content" style={{ marginLeft: 0 }}>

        {/* Header */}
        <header className="header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarDays className="logo-icon" size={24} />
            <span className="logo-text" style={{ fontSize: '1.25rem' }}>Timetable4me</span>
          </div>

          <div className="header-actions">
            <button onClick={() => setCurrentView(v => v === 'dashboard' ? 'schedule' : 'dashboard')}
              className="btn btn-secondary header-schedule-btn"
              style={{ padding: '7px 14px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
              <CalendarIcon size={15} />
              <span className="header-btn-label">{currentView === 'dashboard' ? 'Schedule' : 'Dashboard'}</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowNotifPanel(p => !p); markAllRead(); }}
                className="btn btn-secondary" style={{ padding: '8px', borderRadius: '50%', position: 'relative' }}>
                <Bell size={17} />
                {unread > 0 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', backgroundColor: 'var(--primary)', width: '8px', height: '8px', borderRadius: '50%' }} />}
              </button>

              {showNotifPanel && (
                <div className="notifications-panel">
                  <div className="notification-header">
                    <span>Notifications</span>
                    <button onClick={() => setShowNotifPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0
                      ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No notifications.</div>
                      : notifications.map(n => (
                          <div key={n.id} className={`notification-item ${!n.read ? 'unread' : ''}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                              <span style={{ color: '#fff' }}>{n.title}</span>
                              <span className="notification-time">{n.time}</span>
                            </div>
                            <span style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{n.message}</span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>

            <div className="user-badge" style={{ padding: '4px 8px', gap: '0.5rem' }}>
              <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.75rem' }}>
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <button onClick={handleLogout} className="btn" style={{ padding: '4px', color: 'var(--text-secondary)' }}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        {currentView === 'dashboard' ? (
          <Dashboard
            tasks={tasks} events={events} sessions={sessions} todos={todos}
            onToggleSession={handleToggleSession}
            onUpdateTask={handleUpdateTask} onDeleteTask={handleDeleteTask}
            onUpdateEvent={handleUpdateEvent} onDeleteEvent={handleDeleteEvent}
            onAddTodo={handleAddTodo} onToggleTodo={handleToggleTodo}
            onDeleteTodo={handleDeleteTodo} onClearDoneTodos={handleClearDoneTodos}
            onOpenManager={() => setShowManager(true)}
            onOpenSchedule={() => setCurrentView('schedule')}
          />
        ) : (
          <ScheduleView
            tasks={tasks} events={events} sessions={sessions}
            onBack={() => setCurrentView('dashboard')}
            onOpenManager={() => setShowManager(true)}
            onDeleteTask={handleDeleteTask} onDeleteEvent={handleDeleteEvent}
          />
        )}

        {showManager && (
          <ScheduleManager
            tasks={tasks} events={events} preferences={preferences!}
            conflictedTaskIds={conflictedTaskIds} initialItem={editingItem}
            onAddTask={handleAddTask} onUpdateTask={handleUpdateTask} onDeleteTask={handleDeleteTask}
            onAddEvent={handleAddEvent} onUpdateEvent={handleUpdateEvent} onDeleteEvent={handleDeleteEvent}
            onSavePreferences={handleSavePreferences} onResetData={() => {}}
            onClose={() => setShowManager(false)}
          />
        )}

        <footer style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.72rem', borderTop: '1px solid var(--border-color)', marginTop: '2rem' }}>
          Built by{' '}
          <a href="https://github.com/amrlhakimii" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>amrlhakimii</a>
          {' & '}
          <a href="https://waizhzq.my" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>waizhzq</a>
        </footer>
      </main>
    </div>
  );
}

export default App;
