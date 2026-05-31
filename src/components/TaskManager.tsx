import React, { useState } from 'react';
import type { Task } from '../services/db';
import {
  Plus,
  Trash2,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Filter,
  FileText,
  CheckSquare,
  Square
} from 'lucide-react';

interface TaskManagerProps {
  tasks: Task[];
  conflictedTaskIds: string[];
  onAddTask: (task: Omit<Task, 'id'>) => Promise<void>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const TaskManager: React.FC<TaskManagerProps> = ({
  tasks,
  conflictedTaskIds,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  
  // Standard Form states
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimatedHours, setEstimatedHours] = useState<number>(4);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [notes, setNotes] = useState('');
  const [schedulingMode, setSchedulingMode] = useState<'auto' | 'specific'>('auto');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledStart, setScheduledStart] = useState('14:00');
  const [scheduledEnd, setScheduledEnd] = useState('15:00');

  // Quick Add states
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDuration, setQuickDuration] = useState<number>(2);
  const [quickDeadline, setQuickDeadline] = useState<'tomorrow' | '3days' | 'nextweek'>('tomorrow');

  // Input states for subtasks in each card
  const [subtaskInputs, setSubtaskInputs] = useState<{ [taskId: string]: string }>({});

  const handleStandardAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (schedulingMode === 'auto') {
      if (!deadline) return;
      await onAddTask({
        title,
        deadline,
        estimatedHours,
        completedHours: 0,
        priority,
        status: 'pending',
        notes: notes.trim() || undefined,
        subtasks: [],
      });
    } else {
      if (!scheduledDate || !scheduledStart || !scheduledEnd) return;

      const [sh, sm] = scheduledStart.split(':').map(Number);
      const [eh, em] = scheduledEnd.split(':').map(Number);
      const duration = Math.max(0.5, Number(((eh + em/60) - (sh + sm/60)).toFixed(2)));

      await onAddTask({
        title,
        deadline: scheduledDate,
        estimatedHours: duration,
        completedHours: 0,
        priority,
        status: 'pending',
        notes: notes.trim() || undefined,
        subtasks: [],
        scheduledDate,
        scheduledStart,
        scheduledEnd,
      });
    }

    setTitle('');
    setDeadline('');
    setScheduledDate('');
    setEstimatedHours(4);
    setPriority('medium');
    setNotes('');
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    // Calculate deadline date string based on selection
    const d = new Date();
    if (quickDeadline === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    } else if (quickDeadline === '3days') {
      d.setDate(d.getDate() + 3);
    } else if (quickDeadline === 'nextweek') {
      d.setDate(d.getDate() + 7);
    }
    const deadlineStr = d.toISOString().split('T')[0];

    await onAddTask({
      title: quickTitle,
      deadline: deadlineStr,
      estimatedHours: quickDuration,
      completedHours: 0,
      priority: 'high', // Quick adds are typically urgent, default high
      status: 'pending',
      notes: undefined,
      subtasks: [],
    });

    setQuickTitle('');
    setQuickDuration(2);
  };

  const handleAdjustHours = async (task: Task, amount: number) => {
    const newHours = Math.max(0, Math.min(task.estimatedHours, task.completedHours + amount));
    const newStatus = newHours >= task.estimatedHours
      ? 'completed'
      : newHours > 0
      ? 'in_progress'
      : 'pending';

    await onUpdateTask(task.id, {
      completedHours: newHours,
      status: newStatus,
    });
  };

  const handleToggleComplete = async (task: Task) => {
    const isCompleted = task.status === 'completed';
    await onUpdateTask(task.id, {
      completedHours: isCompleted ? 0 : task.estimatedHours,
      status: isCompleted ? 'pending' : 'completed',
    });
  };

  // Subtask Handlers inside cards
  const handleAddSubtask = async (taskId: string) => {
    const text = subtaskInputs[taskId] || '';
    if (!text.trim()) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newSub = {
      id: `sub-${Date.now()}`,
      text: text.trim(),
      completed: false,
    };
    const updatedSubtasks = [...(task.subtasks || []), newSub];

    await onUpdateTask(taskId, { subtasks: updatedSubtasks });
    setSubtaskInputs((prev) => ({ ...prev, [taskId]: '' }));
  };

  const handleToggleSubtask = async (taskId: string, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    await onUpdateTask(taskId, { subtasks: updatedSubtasks });
  };

  const handleDeleteSubtask = async (taskId: string, subtaskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = (task.subtasks || []).filter((st) => st.id !== subtaskId);

    await onUpdateTask(taskId, { subtasks: updatedSubtasks });
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Quick Add Bar */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(139, 92, 246, 0.05) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
        }}
      >
        <div className="card-title" style={{ color: 'var(--primary)' }}>
          <Sparkles size={18} />
          <h3>Quick Add Task</h3>
        </div>
        <form
          onSubmit={handleQuickAdd}
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginTop: '0.75rem',
          }}
        >
          <div className="form-group" style={{ flexGrow: 2, minWidth: '200px', marginBottom: 0 }}>
            <label className="form-label">Task Title</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Chemistry Quiz, History Draft"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
            <label className="form-label">Hours Needed</label>
            <input
              type="number"
              min="1"
              max="50"
              className="form-control"
              value={quickDuration}
              onChange={(e) => setQuickDuration(parseInt(e.target.value) || 2)}
              required
            />
          </div>

          <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
            <label className="form-label">Deadline</label>
            <select
              className="form-control"
              value={quickDeadline}
              onChange={(e: any) => setQuickDeadline(e.target.value)}
            >
              <option value="tomorrow">Tomorrow</option>
              <option value="3days">In 3 Days</option>
              <option value="nextweek">In a Week</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
            <span>Schedule Now</span>
            <Plus size={16} />
          </button>
        </form>
      </div>

      <div className="dashboard-grid">
        {/* Left Column: Tasks List */}
        <div className="dashboard-panel-left" style={{ gap: '1.5rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="timetable-header" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={18} className="logo-icon" />
                <h3>Your Tasks</h3>
              </div>

              {/* Filters */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--border-radius-md)',
                  padding: '2px',
                }}
              >
                {(['all', 'pending', 'in_progress', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    className="btn"
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      textTransform: 'capitalize',
                      backgroundColor: filter === f ? 'var(--primary)' : 'transparent',
                      color: '#fff',
                    }}
                  >
                    {f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                No tasks found matching this filter.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredTasks.map((task) => {
                  const percent = Math.round((task.completedHours / task.estimatedHours) * 100);
                  const isConflicted = conflictedTaskIds.includes(task.id);

                  return (
                    <div
                      key={task.id}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="checkbox"
                              checked={task.status === 'completed'}
                              onChange={() => handleToggleComplete(task)}
                              style={{
                                width: '18px',
                                height: '18px',
                                accentColor: 'var(--primary)',
                                cursor: 'pointer',
                              }}
                            />
                            <h4
                              style={{
                                color: '#fff',
                                textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                opacity: task.status === 'completed' ? 0.6 : 1,
                              }}
                            >
                              {task.title}
                            </h4>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', paddingLeft: '26px' }}>
                            {task.scheduledDate && task.scheduledStart && task.scheduledEnd ? (
                              <span>
                                Scheduled: <span style={{ color: 'var(--accent)', fontWeight: 650 }}>{task.scheduledDate} @ {task.scheduledStart} - {task.scheduledEnd}</span>
                              </span>
                            ) : (
                              <span>
                                Due: <span style={{ color: '#fff' }}>{task.deadline}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                          <span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span>
                          <button
                            onClick={() => onDeleteTask(task.id)}
                            className="btn btn-danger"
                            style={{ padding: '6px', borderRadius: '8px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Display Task Notes */}
                      {task.notes && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            paddingLeft: '26px',
                            marginTop: '-0.25rem',
                          }}
                        >
                          <FileText size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--primary)' }} />
                          <span style={{ fontStyle: 'italic', lineHeight: '1.4' }}>{task.notes}</span>
                        </div>
                      )}

                      {/* Conflict Alert Banner */}
                      {isConflicted && task.status !== 'completed' && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            color: '#fbbf24',
                            fontSize: '0.75rem',
                          }}
                        >
                          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                          <span>
                            <strong>Schedule Overflow:</strong> Insufficient available time blocks before the deadline. Consider reducing estimated hours or adding more study hours in Preferences.
                          </span>
                        </div>
                      )}

                      {/* Subtasks checklist bullet list */}
                      <div style={{ paddingLeft: '26px', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Checklist Checklist
                        </span>

                        {/* Bullet Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {(task.subtasks || []).map((sub) => (
                            <div
                              key={sub.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                fontSize: '0.8rem',
                                padding: '3px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.01)',
                              }}
                            >
                              <div
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                onClick={() => handleToggleSubtask(task.id, sub.id)}
                              >
                                {sub.completed ? (
                                  <CheckSquare size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                ) : (
                                  <Square size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                )}
                                <span style={{ textDecoration: sub.completed ? 'line-through' : 'none', color: sub.completed ? 'var(--text-secondary)' : '#fff' }}>
                                  {sub.text}
                                </span>
                              </div>
                              <button
                                onClick={() => handleDeleteSubtask(task.id, sub.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '1px' }}
                                className="delete-subtask-btn"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Input inside card to add bullets */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '0.15rem' }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Add new subtask item..."
                            value={subtaskInputs[task.id] || ''}
                            onChange={(e) => setSubtaskInputs((prev) => ({ ...prev, [task.id]: e.target.value }))}
                            style={{ flexGrow: 1, padding: '4px 8px', fontSize: '0.75rem' }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSubtask(task.id);
                              }
                            }}
                          />
                          <button
                            onClick={() => handleAddSubtask(task.id)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {/* Progress bar and adjustments */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', paddingLeft: '26px' }}>
                        <div style={{ flexGrow: 1 }}>
                          <div className="progress-info" style={{ marginBottom: '0.25rem' }}>
                            <span>Progress: {task.completedHours} / {task.estimatedHours} hrs</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="progress-container">
                            <div className="progress-bar" style={{ width: `${percent}%` }} />
                          </div>
                        </div>

                        {/* Adjusters */}
                        {task.status !== 'completed' && (
                          <div style={{ display: 'flex', gap: '4px', alignSelf: 'flex-end' }}>
                            <button
                              onClick={() => handleAdjustHours(task, -1)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
                              disabled={task.completedHours <= 0}
                            >
                              -1h
                            </button>
                            <button
                              onClick={() => handleAdjustHours(task, 1)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
                              disabled={task.completedHours >= task.estimatedHours}
                            >
                              +1h
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Standard Add Task Form */}
        <div className="dashboard-panel-right">
          <div className="card">
            <div className="card-title">
              <Plus className="logo-icon" size={18} />
              <h3>Add New Task</h3>
            </div>
            <form onSubmit={handleStandardAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Programming Assignment 2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Scheduling Mode</label>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                    <input
                      type="radio"
                      name="task-scheduling-mode"
                      checked={schedulingMode === 'auto'}
                      onChange={() => setSchedulingMode('auto')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>Auto-Schedule Blocks</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                    <input
                      type="radio"
                      name="task-scheduling-mode"
                      checked={schedulingMode === 'specific'}
                      onChange={() => setSchedulingMode('specific')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span>Specific Scheduled Time</span>
                  </label>
                </div>
              </div>

              {schedulingMode === 'auto' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Deadline</label>
                    <input
                      type="date"
                      className="form-control"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Estimate (Hours)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className="form-control"
                        value={estimatedHours}
                        onChange={(e) => setEstimatedHours(parseInt(e.target.value) || 4)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Priority</label>
                      <select
                        className="form-control"
                        value={priority}
                        onChange={(e: any) => setPriority(e.target.value)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Scheduled Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Start Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={scheduledStart}
                        onChange={(e) => setScheduledStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={scheduledEnd}
                        onChange={(e) => setScheduledEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-control"
                      value={priority}
                      onChange={(e: any) => setPriority(e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label">Task Notes / Description</label>
                <textarea
                  className="form-control"
                  placeholder="Add notes, requirements, room location, or key study guide rules..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ minHeight: '60px', resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
              >
                <span>Add Task</span>
                <ArrowUpRight size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
