/* ========================================
   StudyFlow — Student Productivity Dashboard
   Application Logic
   ======================================== */

// ─── Utility: today's date string ────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── Utility: get day-of-week labels (last 7 days) ───────
function getLast7Days() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(days[d.getDay()]);
  }
  return result;
}

// ═══════════════════════════════════════════
//  1. DARK MODE MODULE
// ═══════════════════════════════════════════
const DarkMode = (() => {
  const toggleBtn = document.getElementById('darkModeToggle');
  const STORAGE_KEY = 'sf_darkMode';

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') document.body.classList.add('dark-mode');
    toggleBtn.addEventListener('click', toggle);
  }

  function toggle() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem(STORAGE_KEY, document.body.classList.contains('dark-mode'));
  }

  return { init };
})();

// ═══════════════════════════════════════════
//  2. GREETING
// ═══════════════════════════════════════════
function setGreeting() {
  const el = document.getElementById('greeting');
  const h = new Date().getHours();
  let msg = 'Good evening 🌙';
  if (h < 12) msg = 'Good morning ☀️';
  else if (h < 17) msg = 'Good afternoon 🌤️';
  el.textContent = msg;
}

// ═══════════════════════════════════════════
//  3. TASK MANAGER MODULE
// ═══════════════════════════════════════════
const TaskManager = (() => {
  const STORAGE_KEY = 'sf_tasks';
  let tasks = [];

  // DOM
  const input = document.getElementById('taskInput');
  const addBtn = document.getElementById('addTaskBtn');
  const listEl = document.getElementById('taskList');
  const emptyEl = document.getElementById('emptyTasks');
  const pendingEl = document.getElementById('pendingCount');
  const doneEl = document.getElementById('doneCount');

  function init() {
    tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    addBtn.addEventListener('click', addTask);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
    render();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function addTask() {
    const text = input.value.trim();
    if (!text) return;
    tasks.push({ id: Date.now(), text, completed: false });
    input.value = '';
    save();
    render();
  }

  function toggleTask(id) {
    const t = tasks.find(t => t.id === id);
    if (t) t.completed = !t.completed;
    save();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    save();
    render();
  }

  function editTask(id) {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const newText = prompt('Edit task:', t.text);
    if (newText !== null && newText.trim()) {
      t.text = newText.trim();
      save();
      render();
    }
  }

  function render() {
    listEl.innerHTML = '';
    const pending = tasks.filter(t => !t.completed).length;
    const done = tasks.filter(t => t.completed).length;
    pendingEl.textContent = `${pending} pending`;
    doneEl.textContent = `${done} done`;
    emptyEl.style.display = tasks.length === 0 ? 'block' : 'none';

    tasks.forEach(t => {
      const li = document.createElement('li');
      li.className = `task-item${t.completed ? ' completed' : ''}`;
      li.innerHTML = `
        <button class="task-checkbox" title="Toggle complete">${t.completed ? '✓' : ''}</button>
        <span class="task-text">${escapeHTML(t.text)}</span>
        <div class="task-actions">
          <button class="task-btn" title="Edit">✏️</button>
          <button class="task-btn" title="Delete">🗑️</button>
        </div>
      `;
      // Events
      li.querySelector('.task-checkbox').addEventListener('click', () => toggleTask(t.id));
      li.querySelectorAll('.task-btn')[0].addEventListener('click', () => editTask(t.id));
      li.querySelectorAll('.task-btn')[1].addEventListener('click', () => deleteTask(t.id));
      listEl.appendChild(li);
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init };
})();

// ═══════════════════════════════════════════
//  4. POMODORO TIMER MODULE
// ═══════════════════════════════════════════
const PomodoroTimer = (() => {
  const STUDY_SECS = 25 * 60;
  const BREAK_SECS = 5 * 60;
  const CIRCUMFERENCE = 2 * Math.PI * 90; // matches SVG circle r=90
  const SESSION_KEY = 'sf_sessions_' + todayKey();

  let totalSecs = STUDY_SECS;
  let remaining = STUDY_SECS;
  let interval = null;
  let isStudy = true;

  // DOM
  const digits = document.getElementById('timerDigits');
  const label = document.getElementById('timerLabel');
  const progress = document.getElementById('timerProgress');
  const badge = document.getElementById('sessionBadge');
  const startBtn = document.getElementById('timerStart');
  const pauseBtn = document.getElementById('timerPause');
  const resetBtn = document.getElementById('timerReset');
  const countEl = document.getElementById('sessionCount');

  function init() {
    updateDisplay();
    loadSessionCount();
    startBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', pause);
    resetBtn.addEventListener('click', reset);
  }

  function start() {
    if (interval) return;
    interval = setInterval(tick, 1000);
    startBtn.disabled = true;
    pauseBtn.disabled = false;
  }

  function pause() {
    clearInterval(interval);
    interval = null;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function reset() {
    pause();
    isStudy = true;
    totalSecs = STUDY_SECS;
    remaining = STUDY_SECS;
    progress.classList.remove('break-mode');
    badge.textContent = 'Study';
    label.textContent = 'Focus Time';
    updateDisplay();
  }

  function tick() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      interval = null;
      playNotification();

      if (isStudy) {
        incrementSession();
        // Auto-log 0.42 h (25 min) of study time
        GoalsTracker.logAutoTime(25 / 60);
        alert('🎉 Study session complete! Time for a break.');
        isStudy = false;
        totalSecs = BREAK_SECS;
        remaining = BREAK_SECS;
        progress.classList.add('break-mode');
        badge.textContent = 'Break';
        label.textContent = 'Break Time';
      } else {
        alert('⏰ Break over! Ready for another round?');
        isStudy = true;
        totalSecs = STUDY_SECS;
        remaining = STUDY_SECS;
        progress.classList.remove('break-mode');
        badge.textContent = 'Study';
        label.textContent = 'Focus Time';
      }

      startBtn.disabled = false;
      pauseBtn.disabled = true;
    }
    updateDisplay();
  }

  function updateDisplay() {
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    digits.textContent = `${m}:${s}`;

    const fraction = remaining / totalSecs;
    const offset = CIRCUMFERENCE * (1 - fraction);
    progress.style.strokeDashoffset = offset;
  }

  function incrementSession() {
    let count = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
    count++;
    localStorage.setItem(SESSION_KEY, count);
    countEl.textContent = count;
    StreakTracker.recordActivity();
  }

  function loadSessionCount() {
    countEl.textContent = localStorage.getItem(SESSION_KEY) || '0';
  }

  // Sound notification using AudioContext
  function playNotification() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.5);
      });
    } catch (_) {
      // Fallback: no sound
    }
  }

  return { init };
})();

// ═══════════════════════════════════════════
//  5. DAILY GOALS TRACKER MODULE
// ═══════════════════════════════════════════
const GoalsTracker = (() => {
  const GOAL_KEY = 'sf_goal';
  const LOGGED_KEY = 'sf_logged_' + todayKey();
  const WEEKLY_KEY = 'sf_weekly';

  let goalHours = 5;
  let loggedHours = 0;

  // DOM
  const goalInput = document.getElementById('goalInput');
  const setGoalBtn = document.getElementById('setGoalBtn');
  const logInput = document.getElementById('logTimeInput');
  const logBtn = document.getElementById('logTimeBtn');
  const pctEl = document.getElementById('goalPct');
  const barEl = document.getElementById('goalProgressBar');
  const detailEl = document.getElementById('goalDetail');

  function init() {
    goalHours = parseFloat(localStorage.getItem(GOAL_KEY)) || 5;
    loggedHours = parseFloat(localStorage.getItem(LOGGED_KEY)) || 0;
    goalInput.value = goalHours;

    setGoalBtn.addEventListener('click', setGoal);
    logBtn.addEventListener('click', () => logTime(parseFloat(logInput.value) || 0));

    updateUI();
  }

  function setGoal() {
    const v = parseFloat(goalInput.value);
    if (v > 0) {
      goalHours = v;
      localStorage.setItem(GOAL_KEY, goalHours);
      updateUI();
    }
  }

  function logTime(hours) {
    if (hours <= 0) return;
    loggedHours += hours;
    localStorage.setItem(LOGGED_KEY, loggedHours);
    saveWeeklyData(hours);
    StreakTracker.recordActivity();
    ChartModule.refresh();
    updateUI();
  }

  // Called automatically by the timer when a study session completes
  function logAutoTime(hours) {
    logTime(hours);
  }

  function updateUI() {
    const pct = Math.min(100, Math.round((loggedHours / goalHours) * 100));
    pctEl.textContent = `${pct}%`;
    barEl.style.width = `${pct}%`;
    detailEl.textContent = `${loggedHours.toFixed(1)} / ${goalHours} hours completed`;
  }

  // Weekly study data for chart
  function saveWeeklyData(hours) {
    const data = JSON.parse(localStorage.getItem(WEEKLY_KEY)) || {};
    const key = todayKey();
    data[key] = (data[key] || 0) + hours;
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(data));
  }

  function getWeeklyData() {
    const data = JSON.parse(localStorage.getItem(WEEKLY_KEY)) || {};
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push(data[key] || 0);
    }
    return result;
  }

  return { init, logAutoTime, getWeeklyData };
})();

// ═══════════════════════════════════════════
//  6. CHART MODULE
// ═══════════════════════════════════════════
const ChartModule = (() => {
  let chart = null;

  function init() {
    const ctx = document.getElementById('studyChart').getContext('2d');
    const labels = getLast7Days();
    const data = GoalsTracker.getWeeklyData();

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Hours Studied',
          data,
          backgroundColor: createGradientBars(ctx),
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 12, 41, 0.9)',
            titleColor: '#a78bfa',
            bodyColor: '#f1f5f9',
            borderColor: 'rgba(124, 92, 252, 0.3)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: (item) => ` ${item.raw.toFixed(1)} hours`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 11 },
              callback: (v) => v + 'h'
            }
          }
        }
      }
    });
  }

  function createGradientBars(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(124, 92, 252, 0.85)');
    gradient.addColorStop(1, 'rgba(52, 211, 153, 0.55)');
    return gradient;
  }

  function refresh() {
    if (!chart) return;
    chart.data.datasets[0].data = GoalsTracker.getWeeklyData();
    chart.update('active');
  }

  return { init, refresh };
})();

// ═══════════════════════════════════════════
//  7. STREAK TRACKER MODULE
// ═══════════════════════════════════════════
const StreakTracker = (() => {
  const LAST_KEY = 'sf_lastActivity';
  const STREAK_KEY = 'sf_streak';

  const countEl = document.getElementById('streakCount');
  const msgEl = document.getElementById('streakMsg');

  function init() {
    checkStreak();
    updateUI();
  }

  function checkStreak() {
    const last = localStorage.getItem(LAST_KEY);
    if (!last) return;

    const lastDate = new Date(last);
    const today = new Date(todayKey());
    const diff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

    if (diff > 1) {
      // Streak broken
      localStorage.setItem(STREAK_KEY, '0');
    }
  }

  function recordActivity() {
    const last = localStorage.getItem(LAST_KEY);
    const today = todayKey();

    if (last !== today) {
      const lastDate = last ? new Date(last) : null;
      const todayDate = new Date(today);
      let streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);

      if (lastDate) {
        const diff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
        if (diff === 1) {
          streak++;
        } else if (diff > 1) {
          streak = 1;
        }
      } else {
        streak = 1;
      }

      localStorage.setItem(STREAK_KEY, streak);
      localStorage.setItem(LAST_KEY, today);
      updateUI();
    }
  }

  function updateUI() {
    const streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
    countEl.textContent = streak;

    if (streak === 0) {
      msgEl.textContent = 'Start studying to begin your streak!';
    } else if (streak < 3) {
      msgEl.textContent = 'Great start! Keep the momentum going! 💪';
    } else if (streak < 7) {
      msgEl.textContent = "You're on fire! Keep it up! 🔥";
    } else if (streak < 14) {
      msgEl.textContent = 'Amazing consistency! A whole week+! 🌟';
    } else {
      msgEl.textContent = `Legendary ${streak}-day streak! Unstoppable! 🏆`;
    }
  }

  return { init, recordActivity };
})();

// ═══════════════════════════════════════════
//  8. MOTIVATIONAL QUOTES MODULE
// ═══════════════════════════════════════════
const QuotesModule = (() => {
  const quotes = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
    { text: "Don't wish it were easier. Wish you were better.", author: "Jim Rohn" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Education is the passport to the future.", author: "Malcolm X" },
    { text: "The beautiful thing about learning is that nobody can take it away from you.", author: "B.B. King" },
    { text: "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.", author: "Richard Feynman" },
    { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
    { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
    { text: "Your limitation—it's only your imagination.", author: "Unknown" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
    { text: "Great things never come from comfort zones.", author: "Unknown" },
    { text: "Dream it. Believe it. Build it.", author: "Unknown" },
    { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  ];

  const textEl = document.getElementById('quoteText');
  const authorEl = document.getElementById('quoteAuthor');
  let current = -1;

  function init() {
    showNext();
    setInterval(showNext, 30000); // Rotate every 30 seconds
  }

  function showNext() {
    let idx;
    do { idx = Math.floor(Math.random() * quotes.length); } while (idx === current && quotes.length > 1);
    current = idx;

    // Fade out, swap, fade in
    textEl.style.opacity = '0';
    authorEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = `"${quotes[idx].text}"`;
      authorEl.textContent = `— ${quotes[idx].author}`;
      textEl.style.opacity = '1';
      authorEl.style.opacity = '1';
    }, 400);
  }

  return { init };
})();

// ═══════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  DarkMode.init();
  setGreeting();
  TaskManager.init();
  PomodoroTimer.init();
  GoalsTracker.init();
  ChartModule.init();
  StreakTracker.init();
  QuotesModule.init();
});
