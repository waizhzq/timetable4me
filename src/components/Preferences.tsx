import React, { useState } from 'react';
import { dbService } from '../services/db';
import type { UserPreferences } from '../services/db';
import { Sliders, Clock, Calendar, RefreshCw, Trash2, Database, ShieldAlert, Sparkles } from 'lucide-react';

interface PreferencesProps {
  preferences: UserPreferences;
  onSavePreferences: (prefs: UserPreferences) => Promise<void>;
  onResetData: () => void;
}

export const Preferences: React.FC<PreferencesProps> = ({
  preferences,
  onSavePreferences,
  onResetData,
}) => {
  const [earliest, setEarliest] = useState(preferences.earliestStudyTime);
  const [latest, setLatest] = useState(preferences.latestStudyTime);
  const [maxHours, setMaxHours] = useState(preferences.maxStudyHoursPerDay);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);

    // Validate times
    const startNum = parseInt(earliest.split(':')[0]);
    const endNum = parseInt(latest.split(':')[0]);

    if (startNum >= endNum) {
      alert('Earliest study time must be before latest study time.');
      return;
    }

    await onSavePreferences({
      earliestStudyTime: earliest,
      latestStudyTime: latest,
      maxStudyHoursPerDay: maxHours,
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetConfirm = () => {
    if (
      window.confirm(
        'Are you sure you want to reset all data? This will clear all tasks, fixed commitments, and regenerated schedules and restore defaults.'
      )
    ) {
      onResetData();
      alert('Data reset successfully!');
      // Reload page to re-initialize data cleanly
      window.location.reload();
    }
  };

  const isFirebase = dbService.isFirebaseMode();

  return (
    <div className="dashboard-grid">
      {/* Left Column: Preferences Form */}
      <div className="dashboard-panel-left">
        <div className="card">
          <div className="card-title">
            <Sliders className="logo-icon" size={20} />
            <h3>Study Preferences</h3>
          </div>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Adjust these parameters to control when and how the scheduling engine populates study sessions in your calendar.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={14} />
                  <span>Earliest Study Time</span>
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={earliest}
                  onChange={(e) => setEarliest(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={14} />
                  <span>Latest Study Time</span>
                </label>
                <input
                  type="time"
                  className="form-control"
                  value={latest}
                  onChange={(e) => setLatest(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14} />
                <span>Max Study Hours Per Day</span>
              </label>
              <input
                type="number"
                min="1"
                max="12"
                className="form-control"
                value={maxHours}
                onChange={(e) => setMaxHours(parseInt(e.target.value) || 4)}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Prevents scheduling engine from packing more study hours than this value on any single day.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">
                <span>Save Preferences</span>
                <RefreshCw size={14} />
              </button>

              {saveSuccess && (
                <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 550 }}>
                  Preferences saved and schedule recalculated!
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Database Config and Maintenance */}
      <div className="dashboard-panel-right">
        {/* DB Connection info */}
        <div className="card">
          <div className="card-title">
            <Database className="logo-icon" size={18} />
            <h3>Database & Connection</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Current Storage Profile</div>
              <div style={{ fontSize: '1rem', fontWeight: 650, color: '#fff', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isFirebase ? (
                  <>
                    <Database size={16} style={{ color: 'var(--primary)' }} />
                    <span>Firebase Firestore Online</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} style={{ color: '#fbbf24' }} />
                    <span>LocalStorage Sandbox (Offline)</span>
                  </>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isFirebase
                ? 'Your schedules are securely synchronized with Google Firebase services in the cloud.'
                : 'Your data is being stored locally in your browser cache. To link with cloud services, configure the Firebase environment variables (e.g. VITE_FIREBASE_API_KEY) in a local .env file.'}
            </p>
          </div>
        </div>

        {/* Database Maintenance */}
        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <div className="card-title" style={{ color: '#f87171' }}>
            <ShieldAlert size={18} />
            <h3>Danger Zone</h3>
          </div>
          <p style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            Resetting clears your custom scheduler profile and restores the sandbox to default events and tasks.
          </p>

          <button
            onClick={handleResetConfirm}
            className="btn btn-danger"
            style={{ width: '100%', display: 'flex', gap: '0.5rem', justifyContent: 'center', padding: '0.75rem' }}
          >
            <Trash2 size={16} />
            <span>Reset Profile Database</span>
          </button>
        </div>
      </div>
    </div>
  );
};
