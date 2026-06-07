import { auth as fbAuth, db as fbDb } from './firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as onFbAuthStateChanged,
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
  where,
} from 'firebase/firestore';

export interface Task {
  id: string;
  title: string;
  category: 'assignment' | 'quiz' | 'program' | 'date' | 'training' | 'other';
  customCategory?: string;
  color: string;
  hasDeadline: boolean;
  deadline?: string;
  startTime?: string;
  endTime?: string;
  estimatedHours?: number;
  completedHours?: number;
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
  date?: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
  notes?: string;
}

export interface StudySession {
  id: string;
  taskId: string;
  taskTitle: string;
  start: string;
  end: string;
  completed: boolean;
}

export interface UserPreferences {
  earliestStudyTime: string;
  latestStudyTime: string;
  maxStudyHoursPerDay: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  date: string; // YYYY-MM-DD
}

const defaultPreferences: UserPreferences = {
  earliestStudyTime: '08:00',
  latestStudyTime: '22:00',
  maxStudyHoursPerDay: 4,
};

const cleanData = (obj: any): any => {
  const out: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue;
    out[key] = typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])
      ? cleanData(obj[key])
      : obj[key];
  }
  return out;
};

export const dbService = {
  async loginWithGoogle(): Promise<UserProfile> {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(fbAuth!, provider);
    await setDoc(doc(fbDb!, 'users', cred.user.uid), {
      uid: cred.user.uid,
      name: cred.user.displayName || '',
      email: cred.user.email,
    }, { merge: true });
    const prefs = await getDoc(doc(fbDb!, 'users', cred.user.uid, 'config', 'preferences'));
    if (!prefs.exists()) {
      await setDoc(doc(fbDb!, 'users', cred.user.uid, 'config', 'preferences'), defaultPreferences);
    }
    return { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName };
  },

  async logout(): Promise<void> {
    await signOut(fbAuth!);
  },

  onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    return onFbAuthStateChanged(fbAuth!, (user) => {
      callback(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null);
    });
  },

  async getPreferences(uid: string): Promise<UserPreferences> {
    const snap = await getDoc(doc(fbDb!, 'users', uid, 'config', 'preferences'));
    if (snap.exists()) return snap.data() as UserPreferences;
    await setDoc(doc(fbDb!, 'users', uid, 'config', 'preferences'), defaultPreferences);
    return defaultPreferences;
  },

  async savePreferences(uid: string, prefs: UserPreferences): Promise<void> {
    await setDoc(doc(fbDb!, 'users', uid, 'config', 'preferences'), cleanData(prefs));
  },

  async getTasks(uid: string): Promise<Task[]> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'tasks')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task);
  },

  async addTask(uid: string, task: Omit<Task, 'id'>): Promise<Task> {
    const ref = await addDoc(collection(fbDb!, 'users', uid, 'tasks'), cleanData(task));
    return { id: ref.id, ...task };
  },

  async updateTask(uid: string, taskId: string, updates: Partial<Task>): Promise<void> {
    await updateDoc(doc(fbDb!, 'users', uid, 'tasks', taskId), cleanData(updates));
  },

  async deleteTask(uid: string, taskId: string): Promise<void> {
    await deleteDoc(doc(fbDb!, 'users', uid, 'tasks', taskId));
  },

  async getEvents(uid: string): Promise<FixedEvent[]> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'events')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as FixedEvent);
  },

  async addEvent(uid: string, event: Omit<FixedEvent, 'id'>): Promise<FixedEvent> {
    const ref = await addDoc(collection(fbDb!, 'users', uid, 'events'), cleanData(event));
    return { id: ref.id, ...event };
  },

  async updateEvent(uid: string, eventId: string, updates: Partial<FixedEvent>): Promise<void> {
    await updateDoc(doc(fbDb!, 'users', uid, 'events', eventId), cleanData(updates));
  },

  async deleteEvent(uid: string, eventId: string): Promise<void> {
    await deleteDoc(doc(fbDb!, 'users', uid, 'events', eventId));
  },

  async getSessions(uid: string): Promise<StudySession[]> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'sessions')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as StudySession);
  },

  async saveSessions(uid: string, sessions: StudySession[]): Promise<void> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'sessions')));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(fbDb!, 'users', uid, 'sessions', d.id))));
    await Promise.all(sessions.map(s => setDoc(doc(fbDb!, 'users', uid, 'sessions', s.id), cleanData(s))));
  },

  async toggleSessionComplete(uid: string, sessionId: string, completed: boolean, hours: number, taskId: string): Promise<void> {
    await updateDoc(doc(fbDb!, 'users', uid, 'sessions', sessionId), { completed });
    const tasks = await this.getTasks(uid);
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      if (task.estimatedHours !== undefined && task.completedHours !== undefined) {
        const newHours = Math.max(0, Math.min(task.estimatedHours, task.completedHours + (completed ? hours : -hours)));
        await this.updateTask(uid, taskId, {
          completedHours: newHours,
          status: newHours >= task.estimatedHours ? 'completed' : newHours > 0 ? 'in_progress' : 'pending',
        });
      } else {
        await this.updateTask(uid, taskId, {
          status: completed ? 'completed' : 'pending',
        });
      }
    }
  },

  // Todos
  async getTodos(uid: string, date: string): Promise<Todo[]> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'todos'), where('date', '==', date)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Todo);
  },

  async addTodo(uid: string, text: string, date: string): Promise<Todo> {
    const ref = await addDoc(collection(fbDb!, 'users', uid, 'todos'), { text, done: false, date });
    return { id: ref.id, text, done: false, date };
  },

  async toggleTodo(uid: string, todoId: string, done: boolean): Promise<void> {
    await updateDoc(doc(fbDb!, 'users', uid, 'todos', todoId), { done });
  },

  async deleteTodo(uid: string, todoId: string): Promise<void> {
    await deleteDoc(doc(fbDb!, 'users', uid, 'todos', todoId));
  },

  async clearDoneTodos(uid: string, date: string): Promise<void> {
    const snap = await getDocs(query(collection(fbDb!, 'users', uid, 'todos'), where('date', '==', date), where('done', '==', true)));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(fbDb!, 'users', uid, 'todos', d.id))));
  },
};
