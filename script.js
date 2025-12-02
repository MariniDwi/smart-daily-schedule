'use strict';

// ====== Konstanta & Utilitas ======
const STORAGE_KEY = 'sds_tasks';
const START_HOUR = 8; // Mulai otomatis dari jam 08:00

function byId(id) { return document.getElementById(id); }

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseDateOnly(value) {
  // value: 'YYYY-MM-DD' -> Date pada lokal jam 00:00
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function daysBetweenToday(target) {
  // hitung selisih hari antara tanggal target dan 'hari ini' secara date-only
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = t - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getStartOfTodayAt(hour = START_HOUR) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
}

// ====== Storage ======
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Gagal membaca localStorage', e);
    return [];
  }
}

function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error('Gagal menyimpan localStorage', e);
  }
}

// ====== State ======
let tasks = loadTasks();

// ====== Rule-based AI Priority ======
function computePriorityScore(task) {
  let score = 0;

  // --- Deadline rules ---
  // +4 jika deadline hari ini, +3 jika besok, +2 jika <= 7 hari
  if (task.deadline) {
    const d = new Date(task.deadline);
    const days = daysBetweenToday(d);
    if (days === 0) score += 4; // hari ini
    else if (days === 1) score += 3; // besok
    else if (days > 1 && days <= 7) score += 2; // <= 7 hari
  }

  // --- Durasi rules ---
  // >120 menit = +3, 60–120 = +2, 20–59 = +1
  const dur = Number(task.duration) || 0;
  if (dur > 120) score += 3;
  else if (dur >= 60) score += 2;
  else if (dur >= 20) score += 1;

  // --- Tingkat kesulitan rules ---
  // Difficulty 1–3 -> +1..+3
  const diff = Number(task.difficulty) || 1;
  score += Math.max(1, Math.min(3, diff));

  // --- Prioritas manual rules ---
  // Jika ada prioritas manual (1–3), skor tambahan = prioritas × 3
  if (task.manualPriority != null && task.manualPriority !== '') {
    const mp = Number(task.manualPriority);
    if (!isNaN(mp)) score += mp * 3;
  }

  return score;
}

// ====== Rendering ======
function renderTasks() {
  const list = byId('taskList');
  const empty = byId('emptyTasks');
  list.innerHTML = '';

  if (!tasks.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tasks.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task-item';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = t.name;
    const meta = document.createElement('div');
    meta.className = 'task-meta';

    const score = computePriorityScore(t);

    const b1 = document.createElement('span');
    b1.className = 'badge primary';
    b1.textContent = `Durasi: ${t.duration}m`;

    const b2 = document.createElement('span');
    b2.className = 'badge warn';
    b2.textContent = t.deadline ? `Deadline: ${new Date(t.deadline).toLocaleDateString()}` : 'No deadline';

    const b3 = document.createElement('span');
    b3.className = 'badge success';
    b3.textContent = `Kesulitan: ${t.difficulty}`;

    const b4 = document.createElement('span');
    b4.className = 'badge muted';
    b4.textContent = `Skor AI: ${score}`;

    meta.append(b1, b2, b3, b4);

    if (t.manualPriority != null && t.manualPriority !== '') {
      const b5 = document.createElement('span');
      b5.className = 'badge muted';
      b5.textContent = `Prioritas Manual: ${t.manualPriority}`;
      meta.appendChild(b5);
    }

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'item-actions';
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.textContent = 'Hapus';
    del.title = 'Hapus tugas';
    del.addEventListener('click', () => deleteTask(t.id));

    right.appendChild(del);

    li.appendChild(left);
    li.appendChild(right);

    list.appendChild(li);
  });
}

function renderSchedule(schedule) {
  const list = byId('scheduleList');
  const empty = byId('emptySchedule');
  list.innerHTML = '';

  if (!schedule.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  schedule.forEach(item => {
    const li = document.createElement('li');
    li.className = 'schedule-item';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'schedule-meta';
    const b1 = document.createElement('span');
    b1.className = 'badge primary';
    b1.textContent = `Mulai: ${formatTime(item.start)}`;
    const b2 = document.createElement('span');
    b2.className = 'badge success';
    b2.textContent = `Selesai: ${formatTime(item.end)}`;
    const b3 = document.createElement('span');
    b3.className = 'badge muted';
    b3.textContent = `Skor AI: ${item.score}`;

    meta.append(b1, b2, b3);

    left.appendChild(title);
    left.appendChild(meta);

    li.appendChild(left);

    list.appendChild(li);
  });
}

// ====== Actions ======
function addTaskFromForm(e) {
  e.preventDefault();
  clearErrors();

  const name = byId('taskName').value.trim();
  const duration = Number(byId('duration').value);
  const deadlineInput = byId('deadline').value;
  const difficulty = Number(byId('difficulty').value);
  const manualPriorityRaw = byId('manualPriority').value;
  const manualPriority = manualPriorityRaw === '' ? '' : Number(manualPriorityRaw);

  let isValid = true;
  if (!name) {
    isValid = false;
    byId('taskNameError').textContent = 'Nama tugas wajib diisi.';
  }
  if (!Number.isFinite(duration) || duration < 1) {
    isValid = false;
    byId('durationError').textContent = 'Durasi harus angka >= 1.';
  }
  if (!(difficulty >= 1 && difficulty <= 3)) {
    isValid = false;
    // tampilkan dekat difficulty? cukup umumkan via alert singkat
    alert('Tingkat kesulitan harus 1–3');
  }
  if (manualPriority !== '' && !(manualPriority >= 1 && manualPriority <= 3)) {
    isValid = false;
    alert('Prioritas manual (jika diisi) harus 1–3');
  }

  const deadlineDate = parseDateOnly(deadlineInput);
  if (deadlineInput && !deadlineDate) {
    isValid = false;
    alert('Format deadline tidak valid.');
  }

  if (!isValid) return;

  const newTask = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name,
    duration,
    deadline: deadlineDate ? deadlineDate.toISOString() : null,
    difficulty,
    manualPriority: manualPriority === '' ? '' : manualPriority,
    createdAt: Date.now()
  };

  tasks.push(newTask);
  saveTasks(tasks);
  renderTasks();
  // reset form
  byId('taskForm').reset();
}

function clearErrors() {
  byId('taskNameError').textContent = '';
  byId('durationError').textContent = '';
}

function deleteTask(id) {
  if (!confirm('Hapus tugas ini?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(tasks);
  renderTasks();
}

function clearAllTasks() {
  if (!tasks.length) return;
  if (!confirm('Hapus semua tugas?')) return;
  tasks = [];
  saveTasks(tasks);
  renderTasks();
  renderSchedule([]);
}

function generateSchedule() {
  // Buat salinan dengan skor
  const scored = tasks.map(t => ({
    ...t,
    score: computePriorityScore(t)
  }));

  // Urutkan skor tertinggi -> terendah. Jika skor sama, urutkan: deadline lebih awal dulu, lalu durasi pendek dulu.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.duration - b.duration;
  });

  const schedule = [];
  let cursor = getStartOfTodayAt(START_HOUR);

  for (const t of scored) {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + t.duration * 60000);

    schedule.push({
      name: t.name,
      start,
      end,
      score: t.score
    });

    cursor = new Date(end);

    // Sisipkan istirahat 10 menit setelah tugas > 60 menit
    if (t.duration > 60) {
      const breakStart = new Date(cursor);
      const breakEnd = new Date(breakStart.getTime() + 10 * 60000);
      schedule.push({
        name: 'Istirahat',
        start: breakStart,
        end: breakEnd,
        score: '-'
      });
      cursor = new Date(breakEnd);
    }
  }

  renderSchedule(schedule);
}

// ====== Init ======
function init() {
  renderTasks();
  renderSchedule([]);

  byId('taskForm').addEventListener('submit', addTaskFromForm);
  byId('generateScheduleBtn').addEventListener('click', generateSchedule);
  byId('clearAll').addEventListener('click', clearAllTasks);
}

document.addEventListener('DOMContentLoaded', init);
