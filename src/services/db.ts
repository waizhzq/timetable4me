import { auth as fbAuth, db as fbDb, isFirebaseConfigured } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged as onFbAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
} from 'firebase/firestore';

export interface Task {
  id: string;
  title: string;
  category: 'assignment' | 'quiz' | 'program' | 'date' | 'training' | 'other';
  customCategory?: string;
  color: string;
  hasDeadline: boolean;
  deadline?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  estimatedHours: number;
  completedHours: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  subtasks?: { id: string; text: string; completed: boolean }[];
}

export interface FixedEvent {
  id: string;
  title: string;
  type: 'class' | 'training' | 'meeting' | 'work' | 'other';
  customType?: string;
  color: string;
  day?: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  date?: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  recurring: boolean;
  notes?: string;
}

export interface StudySession {
  id: string;
  taskId: string;
  taskTitle: string;
  start: string; // ISO string
  end: string; // ISO string
  completed: boolean;
}

export interface UserPreferences {
  earliestStudyTime: string; // HH:MM
  latestStudyTime: string; // HH:MM
  maxStudyHoursPerDay: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

// ----------------------------------------------------
// LOCAL STORAGE MOCK DB IMPLEMENTATION (Demo Mode)
// ----------------------------------------------------

const MOCK_PREFS_KEY = 't4m_prefs';
const MOCK_TASKS_KEY = 't4m_tasks';
const MOCK_EVENTS_KEY = 't4m_events';
const MOCK_SESSIONS_KEY = 't4m_sessions';
const MOCK_USER_KEY = 't4m_user';

// Helper to get date string relative to today
const getRelativeDateStr = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
};

const defaultPreferences: UserPreferences = {
  earliestStudyTime: '08:00',
  latestStudyTime: '22:00',
  maxStudyHoursPerDay: 4,
};

const getDefaultTasks = (): Task[] => [
  {
    id: 'task-1',
    title: 'Database Assignment',
    category: 'assignment',
    color: '#FF0052',
    hasDeadline: true,
    deadline: getRelativeDateStr(8),
    estimatedHours: 8,
    completedHours: 2,
    priority: 'high',
    status: 'in_progress',
    notes: 'Draft relational schemas.',
    subtasks: [
      { id: 'sub-1-1', text: 'Draw ER Diagram', completed: true },
      { id: 'sub-1-2', text: 'Write DDL scripts', completed: false }
    ]
  },
  {
    id: 'task-2',
    title: 'Physics Quiz',
    category: 'quiz',
    color: '#FFD400',
    hasDeadline: true,
    deadline: getRelativeDateStr(2),
    estimatedHours: 3,
    completedHours: 0,
    priority: 'high',
    status: 'pending',
  },
];

const defaultEvents: FixedEvent[] = [
  {
    id: 'event-1',
    title: 'Programming Class',
    type: 'class',
    color: '#0055DA',
    day: 'Monday',
    startTime: '09:00',
    endTime: '11:00',
    recurring: true,
  },
];

const initializeMockData = () => {
  if (!localStorage.getItem(MOCK_PREFS_KEY)) {
    localStorage.setItem(MOCK_PREFS_KEY, JSON.stringify(defaultPreferences));
  }
  if (!localStorage.getItem(MOCK_TASKS_KEY)) {
    localStorage.setItem(MOCK_TASKS_KEY, JSON.stringify(getDefaultTasks()));
  }
  if (!localStorage.getItem(MOCK_EVENTS_KEY)) {
    localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(defaultEvents));
  }
  if (!localStorage.getItem(MOCK_SESSIONS_KEY)) {
    localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify([]));
  }
};

// ----------------------------------------------------
// PUBLIC API
// ----------------------------------------------------

/**
 * Helper to remove undefined fields from objects before sending to Firestore
 */
const cleanData = (obj: any) => {
  const newObj = { ...obj };
  Object.keys(newObj).forEach((key) => {
    if (newObj[key] === undefined) {
      delete newObj[key];
    } else if (typeof newObj[key] === 'object' && newObj[key] !== null && !Array.isArray(newObj[key])) {
      newObj[key] = cleanData(newObj[key]);
    }
  });
  return newObj;
};

export const dbService = {
  // Check if we are running in Firebase mode or Mock mode
  isFirebaseMode(): boolean {
    return isFirebaseConfigured && fbAuth !== null;
  },

  // Auth Operations
  async signUp(email: string, password: string, name: string): Promise<UserProfile> {
    if (isFirebaseConfigured && fbAuth !== null) {
      const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // Create user document in firestore
      await setDoc(doc(fbDb, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
      });
      // Set default preferences in firestore
      await setDoc(doc(fbDb, 'users', cred.user.uid, 'config', 'preferences'), defaultPreferences);
      return { uid: cred.user.uid, email: cred.user.email, displayName: name };
    } else {
      initializeMockData();
      const mockUser: UserProfile = { uid: 'demo-user-123', email, displayName: name };
      localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUser));
      return mockUser;
    }
  },

  async login(email: string, password: string): Promise<UserProfile> {
    if (isFirebaseConfigured && fbAuth !== null) {
      const cred = await signInWithEmailAndPassword(fbAuth, email, password);
      return { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName };
    } else {
      initializeMockData();
      const mockUser: UserProfile = {
        uid: 'demo-user-123',
        email: email,
        displayName: email.split('@')[0].toUpperCase(),
      };
      localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUser));
      return mockUser;
    }
  },

  async loginWithGoogle(): Promise<UserProfile> {
    if (isFirebaseConfigured && fbAuth !== null) {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(fbAuth, provider);
      // Create user document if doesn't exist
      await setDoc(doc(fbDb, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: cred.user.displayName || 'Google User',
        email: cred.user.email,
      }, { merge: true });
      return { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName };
    } else {
      initializeMockData();
      const mockUser: UserProfile = {
        uid: 'demo-user-123',
        email: 'google-demo@timetable4.me',
        displayName: 'Google Demo User',
      };
      localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUser));
      return mockUser;
    }
  },

  async logout(): Promise<void> {
    if (isFirebaseConfigured && fbAuth !== null) {
      await signOut(fbAuth);
    }
    localStorage.removeItem(MOCK_USER_KEY);
  },

  async resetPassword(email: string): Promise<void> {
    if (isFirebaseConfigured && fbAuth !== null) {
      await sendPasswordResetEmail(fbAuth, email);
    } else {
      console.log(`Mock reset password email sent to ${email}`);
    }
  },

  onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    const fbUnsubscribe = (isFirebaseConfigured && fbAuth !== null)
      ? onFbAuthStateChanged(fbAuth, (user) => {
          if (user) {
            callback({ uid: user.uid, email: user.email, displayName: user.displayName });
          } else {
            // Check if we have a mock user before calling null
            const userStr = localStorage.getItem(MOCK_USER_KEY);
            if (userStr) {
              callback(JSON.parse(userStr));
            } else {
              callback(null);
            }
          }
        })
      : null;

    // Simulate initial check for mock user if firebase is not configured or fails
    if (!fbUnsubscribe) {
      const userStr = localStorage.getItem(MOCK_USER_KEY);
      callback(userStr ? JSON.parse(userStr) : null);
    }

    return () => {
      if (fbUnsubscribe) fbUnsubscribe();
    };
  },

  getCurrentUser(): UserProfile | null {
    const fbUser = fbAuth?.currentUser;
    if (fbUser) {
      return { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName };
    }
    const userStr = localStorage.getItem(MOCK_USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },

  // Preferences Operations
  async getPreferences(uid: string): Promise<UserPreferences> {
    if (this.isFirebaseMode()) {
      const snap = await getDoc(doc(fbDb, 'users', uid, 'config', 'preferences'));
      if (snap.exists()) {
        return snap.data() as UserPreferences;
      }
      // If doesn't exist, create it
      await setDoc(doc(fbDb, 'users', uid, 'config', 'preferences'), defaultPreferences);
      return defaultPreferences;
    } else {
      initializeMockData();
      const prefsStr = localStorage.getItem(MOCK_PREFS_KEY);
      return prefsStr ? JSON.parse(prefsStr) : defaultPreferences;
    }
  },

  async savePreferences(uid: string, preferences: UserPreferences): Promise<void> {
    if (this.isFirebaseMode()) {
      await setDoc(doc(fbDb, 'users', uid, 'config', 'preferences'), cleanData(preferences));
    } else {
      localStorage.setItem(MOCK_PREFS_KEY, JSON.stringify(preferences));
    }
  },

  // Tasks Operations
  async getTasks(uid: string): Promise<Task[]> {
    if (this.isFirebaseMode()) {
      const q = query(collection(fbDb, 'users', uid, 'tasks'));
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Task);
    } else {
      initializeMockData();
      const tasksStr = localStorage.getItem(MOCK_TASKS_KEY);
      return tasksStr ? JSON.parse(tasksStr) : [];
    }
  },

  async addTask(uid: string, task: Omit<Task, 'id'>): Promise<Task> {
    if (this.isFirebaseMode()) {
      const cleaned = cleanData(task);
      const docRef = await addDoc(collection(fbDb, 'users', uid, 'tasks'), cleaned);
      return { id: docRef.id, ...task };
    } else {
      initializeMockData();
      const tasks = await this.getTasks(uid);
      const newTask: Task = { id: `task-${Date.now()}`, ...task };
      tasks.push(newTask);
      localStorage.setItem(MOCK_TASKS_KEY, JSON.stringify(tasks));
      return newTask;
    }
  },

  async updateTask(uid: string, taskId: string, updates: Partial<Task>): Promise<void> {
    if (this.isFirebaseMode()) {
      await updateDoc(doc(fbDb, 'users', uid, 'tasks', taskId), cleanData(updates));
    } else {
      initializeMockData();
      const tasks = await this.getTasks(uid);
      const idx = tasks.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        tasks[idx] = { ...tasks[idx], ...updates };
        localStorage.setItem(MOCK_TASKS_KEY, JSON.stringify(tasks));
      }
    }
  },

  async deleteTask(uid: string, taskId: string): Promise<void> {
    if (this.isFirebaseMode()) {
      await deleteDoc(doc(fbDb, 'users', uid, 'tasks', taskId));
    } else {
      initializeMockData();
      let tasks = await this.getTasks(uid);
      tasks = tasks.filter((t) => t.id !== taskId);
      localStorage.setItem(MOCK_TASKS_KEY, JSON.stringify(tasks));
    }
  },

  // Events Operations
  async getEvents(uid: string): Promise<FixedEvent[]> {
    if (this.isFirebaseMode()) {
      const q = query(collection(fbDb, 'users', uid, 'events'));
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FixedEvent);
    } else {
      initializeMockData();
      const eventsStr = localStorage.getItem(MOCK_EVENTS_KEY);
      return eventsStr ? JSON.parse(eventsStr) : [];
    }
  },

  async addEvent(uid: string, event: Omit<FixedEvent, 'id'>): Promise<FixedEvent> {
    if (this.isFirebaseMode()) {
      const cleaned = cleanData(event);
      const docRef = await addDoc(collection(fbDb, 'users', uid, 'events'), cleaned);
      return { id: docRef.id, ...event };
    } else {
      initializeMockData();
      const events = await this.getEvents(uid);
      const newEvent: FixedEvent = { id: `event-${Date.now()}`, ...event };
      events.push(newEvent);
      localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(events));
      return newEvent;
    }
  },

  async updateEvent(uid: string, eventId: string, updates: Partial<FixedEvent>): Promise<void> {
    if (this.isFirebaseMode()) {
      await updateDoc(doc(fbDb, 'users', uid, 'events', eventId), cleanData(updates));
    } else {
      initializeMockData();
      const events = await this.getEvents(uid);
      const idx = events.findIndex((e) => e.id === eventId);
      if (idx !== -1) {
        events[idx] = { ...events[idx], ...updates };
        localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(events));
      }
    }
  },

  async deleteEvent(uid: string, eventId: string): Promise<void> {
    if (this.isFirebaseMode()) {
      await deleteDoc(doc(fbDb, 'users', uid, 'events', eventId));
    } else {
      initializeMockData();
      let events = await this.getEvents(uid);
      events = events.filter((e) => e.id !== eventId);
      localStorage.setItem(MOCK_EVENTS_KEY, JSON.stringify(events));
    }
  },

  // Study Sessions Operations
  async getSessions(uid: string): Promise<StudySession[]> {
    if (this.isFirebaseMode()) {
      const q = query(collection(fbDb, 'users', uid, 'sessions'));
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as StudySession);
    } else {
      initializeMockData();
      const sessionsStr = localStorage.getItem(MOCK_SESSIONS_KEY);
      return sessionsStr ? JSON.parse(sessionsStr) : [];
    }
  },

  async saveSessions(uid: string, sessions: StudySession[]): Promise<void> {
    if (this.isFirebaseMode()) {
      // Clear old sessions and save new ones
      const q = query(collection(fbDb, 'users', uid, 'sessions'));
      const snap = await getDocs(q);
      
      // Use Promise.all for faster deletion
      await Promise.all(snap.docs.map(d => deleteDoc(doc(fbDb, 'users', uid, 'sessions', d.id))));
      
      // Use Promise.all for faster writing
      await Promise.all(sessions.map(s => setDoc(doc(fbDb, 'users', uid, 'sessions', s.id), cleanData(s))));
    } else {
      localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify(sessions));
    }
  },

  async toggleSessionComplete(
    uid: string,
    sessionId: string,
    completed: boolean,
    hoursToCommit: number,
    taskId: string
  ): Promise<void> {
    // 1. Update session status
    if (this.isFirebaseMode()) {
      await updateDoc(doc(fbDb, 'users', uid, 'sessions', sessionId), { completed });
    } else {
      const sessions = await this.getSessions(uid);
      const sIdx = sessions.findIndex((s) => s.id === sessionId);
      if (sIdx !== -1) {
        sessions[sIdx].completed = completed;
        localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify(sessions));
      }
    }

    // 2. Adjust task completedHours accordingly
    const tasks = await this.getTasks(uid);
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      let newHours = task.completedHours + (completed ? hoursToCommit : -hoursToCommit);
      newHours = Math.max(0, Math.min(task.estimatedHours, newHours));
      
      const newStatus = newHours >= task.estimatedHours
        ? 'completed'
        : newHours > 0
        ? 'in_progress'
        : 'pending';

      await this.updateTask(uid, taskId, {
        completedHours: newHours,
        status: newStatus,
      });
    }
  },

  // Reset Demo Data Helper
  clearMockData(): void {
    localStorage.removeItem(MOCK_PREFS_KEY);
    localStorage.removeItem(MOCK_TASKS_KEY);
    localStorage.removeItem(MOCK_EVENTS_KEY);
    localStorage.removeItem(MOCK_SESSIONS_KEY);
    localStorage.removeItem(MOCK_USER_KEY);
    initializeMockData();
  },
};
