const DB_NAME = "little-ledger";
const DB_VERSION = 1;
const PROFILE_ID = "current";
const app = document.querySelector("#app");
let database;
let profile;
let earnings = [];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("earnings")) {
        db.createObjectStore("earnings", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveRecord(storeName, record) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteAll(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function money(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function toLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(dateString, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateString}T12:00:00`));
}

function getDailyTarget(dayIndex = 0) {
  const baseAmount = Math.floor(profile.goalCents / profile.days);
  return baseAmount + (dayIndex < profile.goalCents % profile.days ? 1 : 0);
}

function getTotalEarned() {
  return earnings.reduce((total, entry) => total + entry.amountCents, 0);
}

function getEarnedForDate(date) {
  return earnings
    .filter((entry) => entry.date === date)
    .reduce((total, entry) => total + entry.amountCents, 0);
}

function getDayIndex() {
  const start = new Date(`${profile.startDate}T12:00:00`);
  const today = new Date(`${toLocalDate(new Date())}T12:00:00`);
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.min(profile.days - 1, Math.floor((todayUtc - startUtc) / 86400000)));
}

function showSetup() {
  app.innerHTML = `
    <section class="welcome-layout">
      <div class="welcome-copy">
        <p class="eyebrow"><span aria-hidden="true">✿</span> Your ideas have superpowers</p>
        <h1>Big dreams.<br /><em>Little steps.</em></h1>
        <p>Every great business starts with an idea. Tell us about yours and we’ll help turn your big goal into a plan you can tackle one day at a time.</p>
        <div class="idea-sticker"><span aria-hidden="true">💡</span> You bring the idea. We’ll bring the plan.</div>
      </div>

      <form class="form-card" id="setup-form" novalidate>
        <div class="form-heading">
          <div>
            <h2>First, meet your business!</h2>
            <p>A few quick questions to make your plan.</p>
          </div>
          <span class="form-sparkle" aria-hidden="true">🚀</span>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" autocomplete="given-name" placeholder="e.g. Jamie" maxlength="40" required />
          </div>
          <div class="field">
            <label for="partner">Partner's name <span class="optional">(optional)</span></label>
            <input id="partner" name="partner" placeholder="e.g. Alex" maxlength="40" />
          </div>
          <div class="field field-wide">
            <label for="business">What's your business called?</label>
            <input id="business" name="business" placeholder="e.g. Sunny Side Lemonade" maxlength="60" required />
          </div>
          <div class="field">
            <label for="goal">How much do you want to earn?</label>
            <div class="input-wrap">
              <span class="prefix" aria-hidden="true">$</span>
              <input class="with-prefix" id="goal" name="goal" type="number" min="0.01" max="1000000" step="0.01" placeholder="50" required />
            </div>
          </div>
          <div class="field">
            <label for="days">In how many days?</label>
            <div class="input-wrap">
              <input class="with-suffix" id="days" name="days" type="number" min="1" max="365" step="1" placeholder="14" required />
              <span class="suffix">days</span>
            </div>
          </div>
          <div class="field field-wide">
            <label for="reason">What are you saving up for?</label>
            <input id="reason" name="reason" placeholder="e.g. a new skateboard" maxlength="100" required />
          </div>
        </div>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="primary-button" type="submit">Make my goal plan <span aria-hidden="true">→</span></button>
        <p class="form-footnote">Your answers stay on this device. Ask a grown-up to help with money decisions.</p>
      </form>
    </section>
  `;

  document.querySelector("#setup-form").addEventListener("submit", handleSetup);
}

async function handleSetup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const goal = Number(data.get("goal"));
  const days = Number(data.get("days"));
  const error = document.querySelector("#form-error");

  if (!String(data.get("name")).trim() || !String(data.get("business")).trim() || !String(data.get("reason")).trim()) {
    error.textContent = "Please fill in your name, business name, and what you're saving for.";
    return;
  }
  if (!Number.isFinite(goal) || goal <= 0 || goal > 1000000) {
    error.textContent = "Enter a goal amount greater than $0 and no more than $1,000,000.";
    return;
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    error.textContent = "Choose a whole number of days between 1 and 365.";
    return;
  }
  if (Math.round(goal * 100) < days) {
    error.textContent = "Choose a goal that gives you at least one cent to earn each day.";
    return;
  }

  profile = {
    id: PROFILE_ID,
    name: String(data.get("name")).trim(),
    partner: String(data.get("partner")).trim(),
    business: String(data.get("business")).trim(),
    goalCents: Math.round(goal * 100),
    reason: String(data.get("reason")).trim(),
    days,
    startDate: toLocalDate(new Date()),
  };

  try {
    await saveRecord("profiles", profile);
    earnings = [];
    renderDashboard();
  } catch (saveError) {
    console.error("Could not save your goal plan.", saveError);
    error.textContent = "We couldn't save your plan. Please try again.";
  }
}

function renderDashboard() {
  const earned = getTotalEarned();
  const remaining = Math.max(0, profile.goalCents - earned);
  const progress = Math.min(100, (earned / profile.goalCents) * 100);
  const dayIndex = getDayIndex();
  const dailyTarget = getDailyTarget(dayIndex);
  const today = toLocalDate(new Date());
  const todayEarned = getEarnedForDate(today);
  const todayProgress = Math.min(100, (todayEarned / dailyTarget) * 100);
  const greetingName = escapeHtml(profile.name);
  const partnerText = profile.partner ? ` & ${escapeHtml(profile.partner)}` : "";
  const planRows = Array.from({ length: profile.days }, (_, index) => {
    const date = new Date(`${profile.startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    const dateString = toLocalDate(date);
    const dayLabel = index === dayIndex ? "Today" : `Day ${index + 1} · ${dateLabel(dateString)}`;
    return `
      <div class="plan-row${index === dayIndex ? " is-today" : ""}">
        <span class="plan-day"><span class="plan-day-mark" aria-hidden="true">${index === dayIndex ? "✦" : "✓"}</span>${dayLabel}</span>
        <span class="plan-amount">${money(getDailyTarget(index))}</span>
      </div>
    `;
  }).join("");

  let encouragement;
  if (earned >= profile.goalCents) {
    encouragement = "You did it! Your hard work added up to a big win. Celebrate with your grown-up!";
  } else if (todayEarned >= dailyTarget) {
    encouragement = "Daily goal reached! Amazing work. Anything extra is a bonus.";
  } else if (todayEarned > 0) {
    encouragement = "You’re on your way. Every little bit counts!";
  } else {
    encouragement = "Every big goal starts with the first little step. You’ve got this!";
  }

  app.innerHTML = `
    <section class="dashboard-header">
      <div>
        <p class="eyebrow"><span aria-hidden="true">✿</span> Your business dashboard</p>
        <h1>Hey, ${greetingName}${partnerText}! <span aria-hidden="true">👋</span></h1>
      </div>
      <div class="header-actions">
        <button class="secondary-button" id="edit-goal" type="button">✎ Edit my goal</button>
        <button class="text-button" id="start-over" type="button">Start over</button>
      </div>
    </section>

    <section class="dashboard-grid" aria-label="Goal progress">
      <article class="card goal-card">
        <p class="goal-label">${escapeHtml(profile.business)}’s big goal</p>
        <p class="goal-amount">${money(profile.goalCents)}</p>
        <p class="goal-reason"><span aria-hidden="true">🎯</span> Saving up for ${escapeHtml(profile.reason)}</p>
        <div class="daily-target"><span>Your daily earning target</span><strong>${money(dailyTarget)}<span aria-hidden="true"> / day</span></strong></div>
      </article>

      <article class="card progress-card">
        <div>
          <div class="card-title-row">
            <div>
              <h2>Your progress</h2>
              <p class="section-subtitle">${earned >= profile.goalCents ? "You reached your goal!" : `${money(remaining)} left to go`}</p>
            </div>
            <span class="progress-emoji" aria-hidden="true">${earned >= profile.goalCents ? "🏆" : "🌟"}</span>
          </div>
          <div class="progress-values">
            <span class="progress-earned">${money(earned)}</span>
            <span class="progress-total">of ${money(profile.goalCents)}</span>
          </div>
          <div class="progress-track" role="progressbar" aria-label="Overall goal progress" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <p class="progress-caption">${Math.round(progress)}% of your big goal complete</p>
        </div>
        <form class="earnings-form" id="earnings-form" novalidate>
          <div class="field">
            <label for="earned-today">Add what you earned today</label>
            <div class="input-wrap">
              <span class="prefix" aria-hidden="true">$</span>
              <input class="with-prefix" id="earned-today" name="earned" type="number" min="0.01" max="1000000" step="0.01" placeholder="0.00" required />
            </div>
          </div>
          <button class="primary-button" type="submit">Add it <span aria-hidden="true">＋</span></button>
        </form>
      </article>
    </section>

    <section class="dashboard-lower" aria-label="Your earning plan">
      <article class="card plan-card">
        <div class="card-title-row">
          <div>
            <h2>Your day-by-day plan</h2>
            <p class="section-subtitle">A little each day adds up to ${money(profile.goalCents)}.</p>
          </div>
          <span class="progress-emoji" aria-hidden="true">🗓️</span>
        </div>
        <div class="plan-list">${planRows}</div>
      </article>

      <article class="card today-card">
        <div class="card-title-row">
          <div>
            <h2>Today's little step</h2>
            <p class="section-subtitle">${dateLabel(today, { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <span class="today-badge">${Math.min(dayIndex + 1, profile.days)} of ${profile.days} days</span>
        </div>
        <p class="today-target">${money(dailyTarget)} <span class="section-subtitle">target</span></p>
        <p class="today-caption">You’ve earned ${money(todayEarned)} today.</p>
        <div class="today-progress-track" role="progressbar" aria-label="Today's earning progress" aria-valuenow="${Math.round(todayProgress)}" aria-valuemin="0" aria-valuemax="100">
          <div class="today-progress-fill" style="width: ${todayProgress}%"></div>
        </div>
        <p class="encouragement"><span aria-hidden="true">💚</span>${encouragement}</p>
      </article>
    </section>
  `;

  document.querySelector("#earnings-form").addEventListener("submit", handleEarnings);
  document.querySelector("#edit-goal").addEventListener("click", showSetupWithCurrentValues);
  document.querySelector("#start-over").addEventListener("click", handleStartOver);
}

function showSetupWithCurrentValues() {
  showSetup();
  document.querySelector("#name").value = profile.name;
  document.querySelector("#partner").value = profile.partner;
  document.querySelector("#business").value = profile.business;
  document.querySelector("#goal").value = (profile.goalCents / 100).toFixed(2);
  document.querySelector("#days").value = profile.days;
  document.querySelector("#reason").value = profile.reason;
}

async function handleEarnings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const amount = Number(new FormData(form).get("earned"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    showToast("Enter an amount greater than $0.");
    return;
  }
  const entry = {
    id: `${toLocalDate(new Date())}-${Date.now()}`,
    date: toLocalDate(new Date()),
    amountCents: Math.round(amount * 100),
  };

  try {
    await saveRecord("earnings", entry);
    earnings.push(entry);
    renderDashboard();
    showToast(`Nice work! ${money(entry.amountCents)} added to your progress.`);
  } catch (saveError) {
    console.error("Could not save today's earnings.", saveError);
    showToast("We couldn't save that yet. Please try again.");
  }
}

async function handleStartOver() {
  if (!window.confirm("Start over and erase this business plan and its earnings from this device?")) return;
  try {
    await deleteAll("profiles");
    await deleteAll("earnings");
    profile = null;
    earnings = [];
    showSetup();
    showToast("All set for a fresh start!");
  } catch (deleteError) {
    console.error("Could not erase the local business plan.", deleteError);
    showToast("We couldn't clear the plan. Please try again.");
  }
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

async function startApp() {
  try {
    database = await openDatabase();
    profile = await readRecord("profiles", PROFILE_ID);
    earnings = await readAll("earnings");
    if (profile) renderDashboard();
    else showSetup();
  } catch (error) {
    console.error("Little Ledger could not open its local database.", error);
    app.innerHTML = `
      <section class="card" role="alert">
        <h1>We couldn't open your notebook</h1>
        <p class="section-subtitle">Your browser may not support local storage for this page. Try opening it in a current version of Chrome, Safari, Firefox, or Edge.</p>
      </section>
    `;
  }
}

startApp();
