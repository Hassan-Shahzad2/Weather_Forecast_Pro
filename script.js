"use strict";

/* =========================================================
   CONSTANTS
   ========================================================= */

const DEFAULT_LOCATION = { name: "Karachi", country: "Pakistan", latitude: 24.8607, longitude: 67.0011 };
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const WEATHER_META = {
  0:  { condition: "Clear sky",        category: "clear" },
  1:  { condition: "Mainly clear",     category: "clear" },
  2:  { condition: "Partly cloudy",    category: "clouds" },
  3:  { condition: "Overcast",         category: "clouds" },
  45: { condition: "Fog",              category: "fog" },
  48: { condition: "Rime fog",         category: "fog" },
  51: { condition: "Light drizzle",    category: "rain" },
  53: { condition: "Drizzle",          category: "rain" },
  55: { condition: "Heavy drizzle",    category: "rain" },
  61: { condition: "Light rain",       category: "rain" },
  63: { condition: "Rain",             category: "rain" },
  65: { condition: "Heavy rain",       category: "rain" },
  71: { condition: "Light snow",       category: "snow" },
  73: { condition: "Snow",             category: "snow" },
  75: { condition: "Heavy snow",       category: "snow" },
  80: { condition: "Rain showers",     category: "rain" },
  81: { condition: "Rain showers",     category: "rain" },
  82: { condition: "Heavy showers",    category: "storm" },
  95: { condition: "Thunderstorm",     category: "storm" },
  96: { condition: "Thunderstorm, hail", category: "storm" },
  99: { condition: "Thunderstorm, hail", category: "storm" },
};

const ICON_BY_CATEGORY = {
  clear: { day: "icon-sun", night: "icon-moon" },
  clouds: { day: "icon-cloud-sun", night: "icon-cloud" },
  fog: { day: "icon-fog", night: "icon-fog" },
  rain: { day: "icon-cloud-rain", night: "icon-cloud-rain" },
  storm: { day: "icon-cloud-storm", night: "icon-cloud-storm" },
  snow: { day: "icon-cloud-snow", night: "icon-cloud-snow" },
};

function weatherMeta(code, isDay) {
  const base = WEATHER_META[code] || { condition: "Unknown", category: "clouds" };
  const icon = ICON_BY_CATEGORY[base.category][isDay ? "day" : "night"];
  return { ...base, icon, isDay };
}

// Open-Meteo's daily weather_code reflects the single worst moment of the
// day (e.g. one hour of passing drizzle), so it can report "light rain" for
// a day that is otherwise dry with a near-zero rain chance. Left unchecked,
// that makes the 7-day strip show a rain icon almost every day even when
// the printed rain % says otherwise. If the code is rain/drizzle/showers
// but the day's actual max rain probability is too low to back it up,
// downgrade it to an overcast/cloud icon so the icon matches the number.
const RAIN_LIKE_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81]);
const RAIN_ICON_MIN_PCT = 20;

function forecastMeta(day) {
  let code = day.code;
  if (RAIN_LIKE_CODES.has(code) && (day.rainPct ?? 0) < RAIN_ICON_MIN_PCT) {
    code = 3; // Overcast -> falls back to the "clouds" icon instead of rain
  }
  return weatherMeta(code, true);
}

/* =========================================================
   DOM REFS
   ========================================================= */

const $ = (id) => document.getElementById(id);

const body = document.body;
const searchForm = $("searchForm");
const cityInput = $("cityInput");
const searchBtn = $("searchBtn");
const locateBtn = $("locateBtn");
const unitToggle = $("unitToggle");

const cityName = $("cityName");
const currentDate = $("currentDate");

const temperature = $("temperature");
const unitLabel = $("unitLabel");
const feelsLike = $("feelsLike");
const humidity = $("humidity");
const windSpeed = $("windSpeed");
const rainChance = $("rainChance");
const weatherCondition = $("weatherCondition");
const weatherIcon = $("weatherIcon");
const weatherUpdated = $("weatherUpdated");

const fajr = $("fajr"), dhuhr = $("dhuhr"), asr = $("asr"), maghrib = $("maghrib"), isha = $("isha");
const hijriDate = $("hijriDate");
const nextPrayer = $("nextPrayer");
const prayerCountdown = $("prayerCountdown");
const countdownFill = $("countdownFill");
const forecastStrip = $("forecastStrip");
const toastStack = $("toastStack");

// Added-feature elements
const favToggle = $("favToggle");
const favoritesBar = $("favoritesBar");
const localTimeEl = $("localTime");

/* =========================================================
   STATE
   ========================================================= */

const state = {
  unit: localStorage.getItem("skySalahUnit") || "C",
  weather: null,        // { tempC, feelsC, humidity, windKmh, rainPct, code, isDay }
  daily: [],             // [{ date, code, maxC, minC, rainPct }]
  prayerTimes: null,
  timezone: null,
  countdownInterval: null,
  prevInterval: null,    // seconds between previous & next prayer, for the progress bar
  prevPrayerSeconds: null,

  // --- added features (local time + saved cities) ---
  lat: null,
  lon: null,
  label: null,
  localClockInterval: null,
};

/* =========================================================
   TOASTS
   ========================================================= */

function showToast(message, tone = "info") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-alert"/></svg><span></span>`;
  el.querySelector("span").textContent = message;
  toastStack.appendChild(el);

  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* =========================================================
   SKELETON / VALUE HELPERS
   ========================================================= */

function setSkeleton(on) {
  document.querySelectorAll(".skeleton-hide").forEach((el) => {
    if (on) el.classList.add("skeleton");
    else el.classList.remove("skeleton");
  });
}

function pulse(el) {
  el.classList.remove("value-updated");
  // eslint-disable-next-line no-unused-expressions
  el.offsetWidth; // force reflow to restart animation
  el.classList.add("value-updated");
}

function animateNumber(el, from, to, suffix = "", duration = 500) {
  if (REDUCED_MOTION || from === null || Number.isNaN(from)) {
    el.textContent = `${to}${suffix}`;
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (to - from) * eased);
    el.textContent = `${val}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function convertC(celsius, unit) {
  return unit === "F" ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius);
}

/* =========================================================
   SKY BACKGROUND ENGINE
   ========================================================= */

const SkyScene = (() => {
  const canvas = document.getElementById("sky-canvas");
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let rafId = null;
  let scene = null; // current descriptor
  let particles = { stars: [], drops: [], flakes: [], clouds: [], fogBands: [] };
  let lightning = { flash: 0, next: rand(4000, 9000), timer: 0 };
  let lastTime = performance.now();

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene) buildParticles(scene);
  }

  function buildParticles(descriptor) {
    const { category, isDay } = descriptor;
    const density = REDUCED_MOTION ? 0.35 : 1;

    particles.stars = [];
    particles.drops = [];
    particles.flakes = [];
    particles.clouds = [];
    particles.fogBands = [];

    if (!isDay && category !== "storm") {
      const count = Math.round(120 * density);
      for (let i = 0; i < count; i++) {
        particles.stars.push({
          x: rand(0, w), y: rand(0, h * 0.75),
          r: rand(0.4, 1.6),
          phase: rand(0, Math.PI * 2),
          speed: rand(0.5, 1.5),
        });
      }
    }
    if (category === "storm") {
      const count = Math.round(70 * density);
      for (let i = 0; i < count; i++) {
        particles.stars.push({
          x: rand(0, w), y: rand(0, h * 0.6),
          r: rand(0.3, 1.1), phase: rand(0, Math.PI * 2), speed: rand(0.5, 1.2),
        });
      }
    }

    if (category === "clouds" || category === "clear") {
      const count = category === "clouds" ? Math.round(6 * density) + 3 : Math.round(3 * density);
      for (let i = 0; i < count; i++) {
        particles.clouds.push({
          x: rand(-200, w + 200), y: rand(h * 0.06, h * 0.4),
          scale: rand(0.6, 1.6), speed: rand(6, 16), opacity: rand(0.25, 0.55),
        });
      }
    }

    if (category === "rain" || category === "storm") {
      const count = Math.round((category === "storm" ? 220 : 160) * density);
      for (let i = 0; i < count; i++) {
        particles.drops.push({
          x: rand(0, w), y: rand(-h, h),
          len: rand(10, 22), speed: rand(560, 900), opacity: rand(0.25, 0.6),
        });
      }
      const cloudCount = Math.round(5 * density) + 2;
      for (let i = 0; i < cloudCount; i++) {
        particles.clouds.push({
          x: rand(-200, w + 200), y: rand(h * 0.02, h * 0.22),
          scale: rand(0.9, 1.9), speed: rand(8, 18), opacity: rand(0.3, 0.55),
        });
      }
    }

    if (category === "snow") {
      const count = Math.round(140 * density);
      for (let i = 0; i < count; i++) {
        particles.flakes.push({
          x: rand(0, w), y: rand(-h, h),
          r: rand(1.4, 3.6), speed: rand(30, 80), drift: rand(-20, 20), phase: rand(0, Math.PI * 2),
        });
      }
    }

    if (category === "fog") {
      const count = Math.round(5 * density) + 3;
      for (let i = 0; i < count; i++) {
        particles.fogBands.push({
          y: rand(h * 0.15, h * 0.9), x: rand(-w * 0.3, w * 0.3),
          width: rand(w * 0.7, w * 1.4), height: rand(40, 100),
          speed: rand(4, 10), opacity: rand(0.12, 0.28),
        });
      }
    }
  }

  function drawSun(t) {
    const cx = w * 0.82, cy = h * 0.16;
    const pulseAmt = REDUCED_MOTION ? 0 : Math.sin(t / 1400) * 8;
    const r = 46 + pulseAmt;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4.2);
    grad.addColorStop(0, "rgba(255,244,214,0.9)");
    grad.addColorStop(0.35, "rgba(255,224,150,0.35)");
    grad.addColorStop(1, "rgba(255,224,150,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 4.2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(255,250,235,0.95)";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  function drawMoon(t) {
    const cx = w * 0.82, cy = h * 0.15;
    const pulseAmt = REDUCED_MOTION ? 0 : Math.sin(t / 2000) * 4;
    const r = 30 + pulseAmt;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 5);
    grad.addColorStop(0, "rgba(220,228,255,0.4)");
    grad.addColorStop(1, "rgba(220,228,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r * 5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(238,241,250,0.95)";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(15,20,35,0.55)";
    ctx.beginPath(); ctx.arc(cx - r * 0.18, cy - r * 0.08, r * 0.42, 0, Math.PI * 2); ctx.fill();
  }

  function drawCloudShape(x, y, scale, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#ffffff";
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(34, -10, 32, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(-34, -6, 30, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -18, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw(now) {
    const dt = Math.min(48, now - lastTime);
    lastTime = now;
    ctx.clearRect(0, 0, w, h);
    if (!scene) { rafId = requestAnimationFrame(draw); return; }

    const { category, isDay } = scene;

    // celestial body
    if (category !== "storm") {
      if (isDay) drawSun(now); else drawMoon(now);
    }

    // stars
    if (particles.stars.length) {
      particles.stars.forEach((s) => {
        const tw = REDUCED_MOTION ? 0.8 : 0.55 + 0.45 * Math.sin(now / 900 * s.speed + s.phase);
        ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.5 * tw).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      });
    }

    // clouds
    if (particles.clouds.length) {
      particles.clouds.forEach((c) => {
        if (!REDUCED_MOTION) {
          c.x += (c.speed * dt) / 1000;
          if (c.x - 200 * c.scale > w) c.x = -220 * c.scale;
        }
        drawCloudShape(c.x, c.y, c.scale, c.opacity);
      });
    }

    // fog bands
    if (particles.fogBands.length) {
      particles.fogBands.forEach((f) => {
        if (!REDUCED_MOTION) {
          f.x += (f.speed * dt) / 1000;
          if (f.x > w) f.x = -f.width;
        }
        const grad = ctx.createLinearGradient(f.x, 0, f.x + f.width, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, `rgba(255,255,255,${f.opacity})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(f.x, f.y, f.width, f.height);
      });
    }

    // rain
    if (particles.drops.length) {
      ctx.strokeStyle = "rgba(210,225,255,0.55)";
      ctx.lineWidth = 1.3;
      particles.drops.forEach((d) => {
        if (!REDUCED_MOTION) {
          d.y += (d.speed * dt) / 1000;
          if (d.y > h) { d.y = -20; d.x = rand(0, w); }
        }
        ctx.globalAlpha = d.opacity;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + d.len);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // snow
    if (particles.flakes.length) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      particles.flakes.forEach((f) => {
        if (!REDUCED_MOTION) {
          f.y += (f.speed * dt) / 1000;
          f.x += Math.sin(now / 900 + f.phase) * 0.4;
          if (f.y > h) { f.y = -10; f.x = rand(0, w); }
        }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      });
    }

    // lightning
    if (category === "storm" && !REDUCED_MOTION) {
      lightning.timer += dt;
      if (lightning.timer > lightning.next) {
        lightning.flash = 1;
        lightning.timer = 0;
        lightning.next = rand(5000, 12000);
      }
      if (lightning.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${lightning.flash * 0.5})`;
        ctx.fillRect(0, 0, w, h);
        lightning.flash -= dt / 220;
        if (lightning.flash < 0) lightning.flash = 0;
      }
    }

    rafId = requestAnimationFrame(draw);
  }

  function setScene(category, isDay) {
    scene = { category, isDay };
    buildParticles(scene);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();

  return { setScene, start };
})();

/* =========================================================
   RENDER: WEATHER
   ========================================================= */

function applyWeatherTheme(code, isDay) {
  const meta = weatherMeta(code, isDay);
  body.dataset.weather = `${meta.category}-${isDay ? "day" : "night"}`;
  SkyScene.setScene(meta.category, isDay);
  return meta;
}

function renderWeather() {
  const w = state.weather;
  if (!w) return;

  const meta = applyWeatherTheme(w.code, w.isDay);

  weatherIcon.querySelector("use").setAttribute("href", `#${meta.icon}`);
  weatherCondition.textContent = meta.condition;
  pulse(weatherCondition);

  const prevTemp = Number(temperature.textContent.replace(/[^\d-]/g, "")) || w._displayedTemp || null;
  const targetTemp = convertC(w.tempC, state.unit);
  animateNumber(temperature, prevTemp, targetTemp);
  unitLabel.textContent = `°${state.unit}`;

  feelsLike.textContent = `${convertC(w.feelsC, state.unit)}°`;
  humidity.textContent = `${w.humidity}%`;
  windSpeed.textContent = `${Math.round(w.windKmh)} km/h`;
  rainChance.textContent = w.rainPct === null ? "—" : `${w.rainPct}%`;

  weatherUpdated.textContent = `Updated ${new Date(w.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  currentDate.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function renderForecast() {
  forecastStrip.innerHTML = "";
  state.daily.forEach((day, idx) => {
    const meta = forecastMeta(day);
    const date = new Date(day.date);
    const dayLabel = idx === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
    const dateLabel = date.toLocaleDateString("en-US", { day: "numeric", month: "short" });

    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <p class="day">${dayLabel}</p>
      <p class="date">${dateLabel}</p>
      <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${meta.icon}"/></svg>
      <p class="forecast-range"><span class="hi">${convertC(day.maxC, state.unit)}°</span><span class="lo">${convertC(day.minC, state.unit)}°</span></p>
      <p class="forecast-rain">${day.rainPct === null ? "" : `☂ ${day.rainPct}%`}</p>
    `;
    forecastStrip.appendChild(card);
  });
}

/* =========================================================
   FETCH: WEATHER + FORECAST
   ========================================================= */

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather-fetch-failed");
  const data = await res.json();

  // Timezone for the local clock (Al Adhan also sets this; both agree).
  if (data.timezone) state.timezone = data.timezone;

  const current = data.current;

  // The "current" timestamp from Open-Meteo can fall between hourly slots
  // (e.g. 18:23 while hourly data is only at 18:00 / 19:00), so an exact
  // string match against hourly.time often misses and silently returns
  // null (shown as "—"). Instead, find the closest hourly slot by actual
  // time difference so rain chance always resolves to a real value.
  let hourIndex = data.hourly.time.indexOf(current.time);
  if (hourIndex === -1 && data.hourly.time.length) {
    const currentMs = new Date(current.time).getTime();
    let closestDiff = Infinity;
    data.hourly.time.forEach((t, i) => {
      const diff = Math.abs(new Date(t).getTime() - currentMs);
      if (diff < closestDiff) {
        closestDiff = diff;
        hourIndex = i;
      }
    });
  }
  const rainPct = hourIndex !== -1 ? data.hourly.precipitation_probability[hourIndex] : null;

  state.weather = {
    tempC: current.temperature_2m,
    feelsC: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windKmh: current.wind_speed_10m,
    rainPct,
    code: current.weather_code,
    isDay: current.is_day === 1,
    updatedAt: Date.now(),
  };

  state.daily = data.daily.time.map((date, i) => ({
    date,
    code: data.daily.weather_code[i],
    maxC: data.daily.temperature_2m_max[i],
    minC: data.daily.temperature_2m_min[i],
    rainPct: data.daily.precipitation_probability_max[i] ?? null,
  }));

  renderWeather();
  renderForecast();
}

/* =========================================================
   FETCH: PRAYER TIMES
   ========================================================= */

async function fetchPrayerTimes(lat, lon) {
  const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("prayer-fetch-failed");
  const data = await res.json();
  const timings = data.data.timings;

  fajr.textContent = formatPrayerTime(timings.Fajr);
  dhuhr.textContent = formatPrayerTime(timings.Dhuhr);
  asr.textContent = formatPrayerTime(timings.Asr);
  maghrib.textContent = formatPrayerTime(timings.Maghrib);
  isha.textContent = formatPrayerTime(timings.Isha);

  const hijri = data.data.date.hijri;
  hijriDate.textContent = `${hijri.day} ${hijri.month.en} ${hijri.year}`;

  state.prayerTimes = {
    Fajr: timings.Fajr, Dhuhr: timings.Dhuhr, Asr: timings.Asr,
    Maghrib: timings.Maghrib, Isha: timings.Isha,
  };
  state.timezone = data.data.meta.timezone;

  startPrayerCountdown();
}

function formatPrayerTime(time) {
  const [h, m] = time.split(" ")[0].split(":");
  let hour = parseInt(h, 10);
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${period}`;
}

/* =========================================================
   PRAYER COUNTDOWN
   ========================================================= */

function getCityTime() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: state.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const time = {};
  parts.forEach((p) => { if (p.type !== "literal") time[p.type] = parseInt(p.value, 10); });
  return time.hour * 3600 + time.minute * 60 + time.second;
}

function toSeconds(prayerTime) {
  const [h, m] = prayerTime.split(" ")[0].split(":").map(Number);
  return h * 3600 + m * 60;
}

function startPrayerCountdown() {
  if (state.countdownInterval) clearInterval(state.countdownInterval);
  updatePrayerCountdown();
  state.countdownInterval = setInterval(updatePrayerCountdown, 1000);
}

function updatePrayerCountdown() {
  if (!state.prayerTimes || !state.timezone) return;

  const currentSeconds = getCityTime();
  const order = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const prayers = order.map((name) => ({ name, seconds: toSeconds(state.prayerTimes[name]) }));

  let next = null;
  let prevSeconds = null;

  for (let i = 0; i < prayers.length; i++) {
    if (prayers[i].seconds > currentSeconds) {
      next = { name: prayers[i].name, remaining: prayers[i].seconds - currentSeconds };
      prevSeconds = i === 0 ? prayers[prayers.length - 1].seconds - 86400 : prayers[i - 1].seconds;
      break;
    }
  }

  if (!next) {
    const fajrSeconds = toSeconds(state.prayerTimes.Fajr);
    next = { name: "Fajr", remaining: 86400 - currentSeconds + fajrSeconds };
    prevSeconds = prayers[prayers.length - 1].seconds;
  }

  nextPrayer.textContent = next.name;
  prayerCountdown.textContent = formatCountdown(next.remaining);

  const totalInterval = (prevSeconds !== null) ? ((next.remaining + currentSeconds) - prevSeconds) : null;
  if (totalInterval && totalInterval > 0) {
    const elapsed = totalInterval - next.remaining;
    const pct = Math.max(0, Math.min(100, (elapsed / totalInterval) * 100));
    countdownFill.style.width = `${pct}%`;
  }

  highlightNextPrayer(next.name);
}

function formatCountdown(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function highlightNextPrayer(name) {
  document.querySelectorAll(".prayer").forEach((row) => {
    row.classList.toggle("active-prayer", row.dataset.name === name);
  });
}

/* =========================================================
   LOCATION FLOWS
   ========================================================= */

async function loadLocation(lat, lon, label) {
  setSkeleton(true);
  searchBtn.disabled = true;
  try {
    cityName.textContent = label;
    state.lat = lat;
    state.lon = lon;
    state.label = label;
    await Promise.all([fetchWeather(lat, lon), fetchPrayerTimes(lat, lon)]);
    localStorage.setItem("skySalahLastLocation", JSON.stringify({ lat, lon, label }));

    startLocalClock();
    updateFavToggle();
    renderFavorites();
  } catch (err) {
    console.error(err);
    showToast("Couldn't load data for this location. Please try again.");
  } finally {
    setSkeleton(false);
    searchBtn.disabled = false;
  }
}

async function searchCity(rawQuery) {
  const city = rawQuery.trim();
  if (!city) {
    showToast("Type a city name first.");
    return;
  }
  searchBtn.disabled = true;
  searchBtn.textContent = "Searching…";
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error("geocode-failed");
    const geoData = await geoRes.json();
    if (!geoData.results || !geoData.results.length) {
      showToast(`No results found for "${city}".`);
      return;
    }
    const loc = geoData.results[0];
    await loadLocation(loc.latitude, loc.longitude, `${loc.name}, ${loc.country}`);
  } catch (err) {
    console.error(err);
    showToast("Something went wrong while searching. Please try again.");
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Search";
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showToast("Location isn't available in this browser.");
    return;
  }
  locateBtn.classList.add("is-loading");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      let label = "Your location";
      try {
        const revRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        if (revRes.ok) {
          const revData = await revRes.json();
          label = [revData.city || revData.locality, revData.countryName].filter(Boolean).join(", ") || label;
        }
      } catch (_) { /* fall back silently to generic label */ }
      await loadLocation(latitude, longitude, label);
      locateBtn.classList.remove("is-loading");
    },
    () => {
      showToast("Couldn't access your location. Showing Karachi instead.");
      locateBtn.classList.remove("is-loading");
      loadLocation(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude, `${DEFAULT_LOCATION.name}, ${DEFAULT_LOCATION.country}`);
    },
    { timeout: 8000 }
  );
}

/* =========================================================
   UNIT TOGGLE
   ========================================================= */

function setUnit(unit) {
  if (unit === state.unit) return;
  state.unit = unit;
  localStorage.setItem("skySalahUnit", unit);
  unitToggle.querySelectorAll(".unit-btn").forEach((btn) => {
    const active = btn.dataset.unit === unit;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  if (state.weather) renderWeather();
  if (state.daily.length) renderForecast();
}

/* =========================================================
   EVENTS
   ========================================================= */

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  searchCity(cityInput.value);
});

locateBtn.addEventListener("click", useMyLocation);

unitToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".unit-btn");
  if (btn) setUnit(btn.dataset.unit);
});

/* =========================================================
   INIT
   ========================================================= */

function fallbackLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem("skySalahLastLocation"));
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number") {
      return saved;
    }
  } catch (_) { /* ignore malformed storage */ }
  return { lat: DEFAULT_LOCATION.latitude, lon: DEFAULT_LOCATION.longitude, label: `${DEFAULT_LOCATION.name}, ${DEFAULT_LOCATION.country}` };
}

function init() {
  setUnit(state.unit);
  initFeatures();
  setSkeleton(true);
  SkyScene.start();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = `${DEFAULT_LOCATION.name}, ${DEFAULT_LOCATION.country}`;
        try {
          const revRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          if (revRes.ok) {
            const revData = await revRes.json();
            label = [revData.city || revData.locality, revData.countryName].filter(Boolean).join(", ") || label;
          }
        } catch (_) { /* keep default label */ }
        loadLocation(latitude, longitude, label);
      },
      () => {
        const fb = fallbackLocation();
        loadLocation(fb.lat, fb.lon, fb.label);
      },
      { timeout: 6000 }
    );
  } else {
    const fb = fallbackLocation();
    loadLocation(fb.lat, fb.lon, fb.label);
  }
}

init();
/* =========================================================
   ADDED FEATURES — live local time + saved cities
   Fully client-side: local time is recomputed from the city's
   timezone; saved cities persist in localStorage (this browser
   only — no account or backend involved).
   ========================================================= */

/* ---------- Local time ---------- */

function startLocalClock() {
  if (state.localClockInterval) clearInterval(state.localClockInterval);
  const tz = state.timezone;
  if (!tz) {
    localTimeEl.textContent = "—";
    return;
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const tick = () => {
    localTimeEl.textContent = `Local time ${fmt.format(new Date())} · ${tz.replace(/_/g, " ")}`;
  };
  tick();
  state.localClockInterval = setInterval(tick, 1000);
}

/* ---------- Saved / favorite cities ---------- */

const FAV_KEY = "skySalahFavorites";

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
  catch { return []; }
}
function saveFavorites(list) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
}
function favKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}
function isFavorite(lat, lon) {
  if (lat === null) return false;
  const k = favKey(lat, lon);
  return getFavorites().some((f) => favKey(f.lat, f.lon) === k);
}

function toggleFavorite() {
  if (state.lat === null) return;
  const k = favKey(state.lat, state.lon);
  let list = getFavorites();
  if (list.some((f) => favKey(f.lat, f.lon) === k)) {
    list = list.filter((f) => favKey(f.lat, f.lon) !== k);
    showToast("Removed from saved cities.");
  } else {
    list.unshift({ label: state.label, lat: state.lat, lon: state.lon });
    list = list.slice(0, 12); // keep the bar tidy
    showToast("Saved to your cities.");
  }
  saveFavorites(list);
  updateFavToggle();
  renderFavorites();
}

function removeFavorite(fav) {
  saveFavorites(getFavorites().filter((f) => favKey(f.lat, f.lon) !== favKey(fav.lat, fav.lon)));
  updateFavToggle();
  renderFavorites();
  showToast("Removed from saved cities.");
}

function updateFavToggle() {
  const fav = isFavorite(state.lat, state.lon);
  favToggle.classList.toggle("is-active", fav);
  favToggle.setAttribute("aria-pressed", String(fav));
  favToggle.title = fav ? "Remove from saved cities" : "Save this city";
}

function renderFavorites() {
  const list = getFavorites();
  favoritesBar.innerHTML = "";
  if (!list.length) {
    favoritesBar.hidden = true;
    return;
  }
  favoritesBar.hidden = false;

  list.forEach((fav) => {
    const current =
      state.lat !== null && favKey(fav.lat, fav.lon) === favKey(state.lat, state.lon);

    const chip = document.createElement("div");
    chip.className = "fav-chip" + (current ? " is-current" : "");

    const load = document.createElement("button");
    load.type = "button";
    load.className = "fav-chip-load";
    load.textContent = fav.label;
    load.addEventListener("click", () => loadLocation(fav.lat, fav.lon, fav.label));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "fav-chip-del";
    del.setAttribute("aria-label", `Remove ${fav.label}`);
    del.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-close"/></svg>`;
    del.addEventListener("click", (e) => { e.stopPropagation(); removeFavorite(fav); });

    chip.append(load, del);
    favoritesBar.appendChild(chip);
  });
}

/* ---------- Feature init ---------- */

function initFeatures() {
  renderFavorites();
  favToggle.addEventListener("click", toggleFavorite);
}