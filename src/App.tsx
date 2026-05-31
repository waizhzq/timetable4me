import { useState, useEffect } from 'react';
import { dbService } from './services/db';
import type { Task, FixedEvent, StudySession, UserPreferences, UserProfile } from './services/db';
import { generateSchedule } from './services/scheduler';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import {
  Bell,
  LogOut,
  X,
  CalendarDays
} from 'lucide-react';

interface InAppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Core Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<FixedEvent[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [conflictedTaskIds, setConflictedTaskIds] = useState<string[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = dbService.onAuthStateChanged((profile) => {
      setUser(profile);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch initial data when user logs in
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  // Periodic check for upcoming sessions or deadlines
  useEffect(() => {
    if (!user || tasks.length === 0 || sessions.length === 0) return;

    const runChecks = () => {
      const now = new Date();
      const currentNotifs: InAppNotification[] = [];

      // 1. Check for upcoming sessions (starts in 15 minutes)
      sessions.forEach((session) => {
        if (session.completed) return;
        const sTime = new Date(session.start);
        const diffMs = sTime.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (diffMins > 0 && diffMins <= 15) {
          currentNotifs.push({
            id: `session-warning-${session.id}`,
            title: 'Upcoming Session',
            message: `"${session.taskTitle}" study block starts in ${Math.ceil(diffMins)} minutes!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
          });
        }
      });

      // 2. Check for deadline warnings (due within 24 hours)
      tasks.forEach((task) => {
        if (task.status === 'completed') return;
        const dl = new Date(task.deadline + 'T23:59:59');
        const diffMs = dl.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > 0 && diffHours <= 24) {
          currentNotifs.push({
            id: `deadline-warning-${task.id}`,
            title: 'Deadline Warning',
            message: `"${task.title}" is due in ${Math.ceil(diffHours)} hours!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
          });
        }
      });

      if (currentNotifs.length > 0) {
        setNotifications((prev) => {
          // Avoid duplicate notification ids
          const filtered = prev.filter((p) => !currentNotifs.some((c) => c.id === p.id));
          return [...currentNotifs, ...filtered];
        });
      }
    };

    // Run immediately and every 2 minutes
    runChecks();
    const interval = setInterval(runChecks, 120000);
    return () => clearInterval(interval);
  }, [user, tasks, sessions]);

  const loadUserData = async () => {
    if (!user) return;
    try {
      const fetchedPrefs = await dbService.getPreferences(user.uid);
      const fetchedTasks = await dbService.getTasks(user.uid);
      const fetchedEvents = await dbService.getEvents(user.uid);
      const fetchedSessions = await dbService.getSessions(user.uid);

      setPreferences(fetchedPrefs);
      setTasks(fetchedTasks);
      setEvents(fetchedEvents);

      // Run scheduler with fresh loads if sessions are empty, else load stored ones
      if (fetchedSessions.length === 0 && fetchedTasks.length > 0) {
        const result = generateSchedule(fetchedTasks, fetchedEvents, fetchedPrefs);
        await dbService.saveSessions(user.uid, result.sessions);
        setSessions(result.sessions);
        setConflictedTaskIds(result.conflictedTaskIds);
      } else {
        setSessions(fetchedSessions);
        // Double check conflict markings based on current tasks
        const result = generateSchedule(fetchedTasks, fetchedEvents, fetchedPrefs);
        setConflictedTaskIds(result.conflictedTaskIds);
      }
    } catch (error) {
      console.error('Error loading scheduler data:', error);
    }
  };

  const handleRecalculateSchedule = async (
    updatedTasks: Task[],
    updatedEvents: FixedEvent[],
    updatedPrefs: UserPreferences,
    isSilence: boolean = false
  ) => {
    if (!user) return;
    try {
      const result = generateSchedule(updatedTasks, updatedEvents, updatedPrefs);
      await dbService.saveSessions(user.uid, result.sessions);
      
      setSessions(result.sessions);
      setConflictedTaskIds(result.conflictedTaskIds);

      if (!isSilence) {
        const newNotif: InAppNotification = {
          id: `schedule-change-${Date.now()}`,
          title: 'Schedule Regenerated',
          message: 'Calendar slots recalculated based on your latest updates.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          read: false,
        };
        setNotifications((prev) => [newNotif, ...prev]);
      }
    } catch (error) {
      console.error('Error recalculating schedule:', error);
    }
  };

  // Auth Complete
  const handleAuthSuccess = (profile: UserProfile) => {
    setUser(profile);
  };

  // Logout
  const handleLogout = async () => {
    await dbService.logout();
    setUser(null);
    setTasks([]);
    setEvents([]);
    setSessions([]);
    setPreferences(null);
    setNotifications([]);
  };

  // Tasks operations handlers
  const handleAddTask = async (task: Omit<Task, 'id'>) => {
    if (!user || !preferences) return;
    try {
      const newTask = await dbService.addTask(user.uid, task);
      const updatedTasks = [...tasks, newTask];
      setTasks(updatedTasks);
      await handleRecalculateSchedule(updatedTasks, events, preferences);
    } catch (error) {
      console.error('Failed to add task:', error);
      const errNotif: InAppNotification = {
        id: `error-${Date.now()}`,
        title: 'Save Failed',
        message: 'Could not save the new task. Please check your connection.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };
      setNotifications((prev) => [errNotif, ...prev]);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!user || !preferences) return;
    try {
      await dbService.updateTask(user.uid, taskId, updates);
      const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
      setTasks(updatedTasks);
      
      // If completing a task, regenerate to clean up scheduled hours
      // Or if adjusting completed hours, regenerate to update target
      await handleRecalculateSchedule(updatedTasks, events, preferences, true);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!user || !preferences) return;
    try {
      await dbService.deleteTask(user.uid, taskId);
      const updatedTasks = tasks.filter((t) => t.id !== taskId);
      setTasks(updatedTasks);
      await handleRecalculateSchedule(updatedTasks, events, preferences);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Events operations handlers
  const handleAddEvent = async (event: Omit<FixedEvent, 'id'>) => {
    if (!user || !preferences) return;
    try {
      const newEvent = await dbService.addEvent(user.uid, event);
      const updatedEvents = [...events, newEvent];
      setEvents(updatedEvents);
      await handleRecalculateSchedule(tasks, updatedEvents, preferences);
    } catch (error) {
      console.error('Failed to add event:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!user || !preferences) return;
    try {
      await dbService.deleteEvent(user.uid, eventId);
      const updatedEvents = events.filter((e) => e.id !== eventId);
      setEvents(updatedEvents);
      await handleRecalculateSchedule(tasks, updatedEvents, preferences);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleUpdateEvent = async (eventId: string, updates: Partial<FixedEvent>) => {
    if (!user || !preferences) return;
    try {
      await dbService.updateEvent(user.uid, eventId, updates);
      const updatedEvents = events.map((e) => (e.id === eventId ? { ...e, ...updates } : e));
      setEvents(updatedEvents);
      await handleRecalculateSchedule(tasks, updatedEvents, preferences, true);
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  // Preferences handler
  const handleSavePreferences = async (newPrefs: UserPreferences) => {
    if (!user) return;
    try {
      await dbService.savePreferences(user.uid, newPrefs);
      setPreferences(newPrefs);
      await handleRecalculateSchedule(tasks, events, newPrefs);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  // Toggle study session completion
  const handleToggleSessionComplete = async (
    sessionId: string,
    completed: boolean,
    hours: number,
    taskId: string
  ) => {
    if (!user || !preferences) return;
    try {
      await dbService.toggleSessionComplete(user.uid, sessionId, completed, hours, taskId);
      
      // Reload state after DB updates
      const fetchedTasks = await dbService.getTasks(user.uid);
      const fetchedSessions = await dbService.getSessions(user.uid);
      setTasks(fetchedTasks);
      setSessions(fetchedSessions);

      // Run minor recalculation check
      const result = generateSchedule(fetchedTasks, events, preferences);
      setConflictedTaskIds(result.conflictedTaskIds);
    } catch (error) {
      console.error('Failed to toggle session:', error);
    }
  };

  // Clear data
  const handleResetData = () => {
    if (user) {
      dbService.clearMockData();
      loadUserData();
    }
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#080b11' }}>
        <div style={{ textAlign: 'center' }}>
          <CalendarDays className="logo-icon animate-pulse" size={48} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginTop: '1rem', color: '#fff' }}>Loading Scheduler...</h2>
        </div>
      </div>
    );
  }

  if (!user || !preferences) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Main Panel Content */}
      <main className="main-content" style={{ marginLeft: 0 }}>
        {/* Header Bar */}
        <header className="header-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CalendarDays className="logo-icon" size={28} />
            <span className="logo-text" style={{ fontSize: '1.5rem' }}>Timetable4me</span>
          </div>

          <div className="header-actions">
            {/* Notification Center */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowNotifPanel(!showNotifPanel); markAllNotificationsRead(); }}
                className="btn btn-secondary"
                style={{ padding: '10px', borderRadius: '50%', position: 'relative' }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      backgroundColor: 'var(--danger)',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                    }}
                  />
                )}
              </button>

              {showNotifPanel && (
                <div className="notifications-panel">
                  <div className="notification-header">
                    <span>Notifications</span>
                    <button
                      onClick={() => setShowNotifPanel(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No notifications.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div key={notif.id} className={`notification-item ${!notif.read ? 'unread' : ''}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                            <span style={{ color: '#fff' }}>{notif.title}</span>
                            <span className="notification-time">{notif.time}</span>
                          </div>
                          <span style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{notif.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="user-badge" style={{ padding: '4px 8px', gap: '0.5rem' }}>
              <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}>
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="user-info" style={{ display: 'none' }}> {/* Hidden on small screens, can be shown via media queries */}
                <div className="user-name" style={{ fontSize: '0.75rem' }}>{user.displayName || 'User'}</div>
              </div>
              <button onClick={handleLogout} className="btn" style={{ padding: '4px', color: 'var(--text-secondary)' }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Master Dashboard View */}
        <Dashboard
          tasks={tasks}
          events={events}
          sessions={sessions}
          preferences={preferences}
          conflictedTaskIds={conflictedTaskIds}
          onToggleSession={handleToggleSessionComplete}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAddTask={handleAddTask}
          onAddEvent={handleAddEvent}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
          onSavePreferences={handleSavePreferences}
          onResetData={handleResetData}
        />
      </main>
    </div>
  );
}

export default App;
