import { jsPDF } from 'jspdf';
import type { FixedEvent, StudySession, Task } from '../services/db';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtISOTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

interface DayEntry {
  time: string;
  sortKey: string;
  label: string;
  kind: 'event' | 'study';
}

export function exportWeekAsPdf(
  events: FixedEvent[],
  sessions: StudySession[],
  tasks: Task[],
  referenceDate: Date = new Date()
): void {
  const weekStart = getWeekStart(referenceDate);
  const weekEnd = addDays(weekStart, 6);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const colW = pageW - margin * 2;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(234, 84, 85);
  doc.rect(0, 0, pageW, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('Timetable4me', margin, 14);

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(weekLabel, pageW - margin, 14, { align: 'right' });

  let y = 30;

  // ── One day per section ──────────────────────────────────────────────────
  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(weekStart, i);
    const dayName = DAYS[i];
    const dateStr = toDateStr(dayDate);
    const isToday = toDateStr(new Date()) === dateStr;

    const entries: DayEntry[] = [];

    // recurring events for this weekday
    events
      .filter(e => e.recurring && e.day === dayName)
      .forEach(e => {
        entries.push({
          time: `${fmt12(e.startTime)} – ${fmt12(e.endTime)}`,
          sortKey: e.startTime,
          label: e.title,
          kind: 'event',
        });
      });

    // one-off events on this date
    events
      .filter(e => !e.recurring && e.date === dateStr)
      .forEach(e => {
        entries.push({
          time: `${fmt12(e.startTime)} – ${fmt12(e.endTime)}`,
          sortKey: e.startTime,
          label: e.title,
          kind: 'event',
        });
      });

    // study sessions on this date
    sessions
      .filter(s => s.start.startsWith(dateStr))
      .forEach(s => {
        const task = tasks.find(t => t.id === s.taskId);
        entries.push({
          time: `${fmtISOTime(s.start)} – ${fmtISOTime(s.end)}`,
          sortKey: new Date(s.start).toTimeString().slice(0, 5),
          label: s.taskTitle + (task?.category ? ` (${task.category})` : ''),
          kind: 'study',
        });
      });

    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // page break if needed
    const sectionHeight = 9 + Math.max(entries.length, 1) * 7 + 4;
    if (y + sectionHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      y = 16;
    }

    // day heading bar
    if (isToday) {
      doc.setFillColor(234, 84, 85);
    } else {
      doc.setFillColor(45, 64, 89);
    }
    doc.roundedRect(margin, y, colW, 8, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${dayName.toUpperCase()}   ${dayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      margin + 4,
      y + 5.5
    );
    y += 10;

    if (entries.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text('No items', margin + 4, y + 4);
      y += 8;
    } else {
      entries.forEach((entry, idx) => {
        const rowY = y + idx * 7;

        // alternating row tint
        if (idx % 2 === 0) {
          doc.setFillColor(248, 248, 250);
          doc.rect(margin, rowY, colW, 7, 'F');
        }

        // left accent stripe
        if (entry.kind === 'event') {
          doc.setFillColor(240, 123, 63); // orange
        } else {
          doc.setFillColor(234, 84, 85);  // coral
        }
        doc.rect(margin, rowY, 2.5, 7, 'F');

        // time column
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(entry.time, margin + 5, rowY + 4.8);

        // title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 40);
        const maxTitleW = colW - 52;
        const truncated = doc.splitTextToSize(entry.label, maxTitleW)[0];
        doc.text(truncated, margin + 52, rowY + 4.8);
      });
      y += entries.length * 7 + 4;
    }

    y += 4;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text(
    `Generated by Timetable4me · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    pageW / 2,
    pageH - 6,
    { align: 'center' }
  );

  doc.save(`timetable-week-${toDateStr(weekStart)}.pdf`);
}
