const weatherContainer = document.getElementById("weatherContainer");
const suggestionsEl = document.getElementById("suggestions");
const cityError = document.getElementById("cityError");
const cityInput = document.getElementById("cityInput");
const refreshBtn = document.getElementById("refreshBtn");
const addCityBtn = document.getElementById("addCityBtn");

let savedCities = JSON.parse(localStorage.getItem("cities")) || [];
let selectedSuggestion = null;

const weatherCodes = {
  0: "Ясно",
  1: "Частично облачно",
  2: "Облачно",
  3: "Пасмурно",
  45: "Туман",
  48: "Туман с инеем",
  51: "Мелкий дождь",
  53: "Умеренный дождь",
  55: "Сильный дождь",
  61: "Дождь",
  63: "Сильный дождь",
  65: "Сильный дождь",
  71: "Снег",
  73: "Сильный снег",
  75: "Очень сильный снег",
  80: "Ливень",
  81: "Сильный ливень",
  82: "Очень сильный ливень",
  95: "Гроза",
  96: "Гроза с небольшим градом",
  99: "Гроза с градом"
};

function saveCities() {
  localStorage.setItem("cities", JSON.stringify(savedCities));
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function humanDate(iso) {
  const d = new Date(iso);
  const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

let suggTimeout = null;
cityInput.addEventListener("input", () => {
  clearTimeout(suggTimeout);
  const v = cityInput.value.trim();
  selectedSuggestion = null;
  if (!v) { suggestionsEl.style.display = "none"; return; }

  suggTimeout = setTimeout(async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=8&language=ru&format=json`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        suggestionsEl.style.display = "none";
        return;
      }
      suggestionsEl.innerHTML = data.results
        .map(r => {
          const disp = `${r.name}${r.admin1 ? ", " + r.admin1 : ""}${r.country ? ", " + r.country : ""}`;
          return `<li 
                    data-lat="${r.latitude}" 
                    data-lon="${r.longitude}" 
                    data-display="${escapeHtml(disp)}"
                  >${escapeHtml(disp)}</li>`;
        }).join("");
      suggestionsEl.style.display = "block";
    } catch (err) { console.warn("Ошибка подсказок", err); }
  }, 250);
});

suggestionsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const lat = parseFloat(li.dataset.lat);
  const lon = parseFloat(li.dataset.lon);
  const display = li.dataset.display || li.textContent.trim();

  cityInput.value = display;
  suggestionsEl.style.display = "none";
  selectedSuggestion = { name: display.split(",")[0].trim(), displayName: display, lat, lon };
});

async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=ru&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка геокодинга");
  return res.json();
}

async function fetchForecastByCoords(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Ошибка получения прогноза");
  return res.json();
}

function createCityCard(city) {
  const card = document.createElement("div");
  card.className = "weather-card";
  card.dataset.id = city.id;
  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-title">${city.displayName || city.name}</div>
        <div class="card-meta">${city.isGeo ? "Текущее местоположение" : "Город"}</div>
      </div>
      <div class="card-actions">
        <button class="btn remove-card">Удалить</button>
      </div>
    </div>
    <div class="card-body">
      <p class="loading">Загрузка...</p>
    </div>
  `;
  card.querySelector(".remove-card").addEventListener("click", () => {
    savedCities = savedCities.filter(c => c.id !== city.id);
    saveCities();
    renderAll();
  });
  return card;
}

async function loadForecastForCard(city, cardEl) {
  const body = cardEl.querySelector(".card-body");
  body.innerHTML = `<p class="loading">Загрузка...</p>`;
  try {
    let { lat, lon } = city;
    if ((!lat || !lon) && !city.isGeo) {
      const geo = await geocodeCity(city.name);
      if (!geo.results || geo.results.length === 0) {
        body.innerHTML = `<p class="error">Город не найден.</p>`;
        return;
      }
      const g = geo.results[0];
      lat = g.latitude; lon = g.longitude;
      city.lat = lat; city.lon = lon;
      saveCities();
    }

    const f = await fetchForecastByCoords(lat, lon);
    const times = f.daily.time;
    const tmin = f.daily.temperature_2m_min;
    const tmax = f.daily.temperature_2m_max;
    const codes = f.daily.weathercode;

    let html = "";
    for (let i = 0; i < 3; i++) {
      const dateLabel = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : "Послезавтра";
      const weatherText = weatherCodes[codes[i]] || "—";
      html += `<div class="day"><b>${dateLabel} (${humanDate(times[i])}):</b> ${Math.round(tmin[i])}°C — ${Math.round(tmax[i])}°C, ${weatherText}</div>`;
    }
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p class="error">Ошибка загрузки: ${err.message}</p>`;
  }
}

function renderAll() {
  weatherContainer.innerHTML = "";
  if (savedCities.length === 0) {
    weatherContainer.innerHTML = `<p class="loading">Нет сохранённых городов. Разрешите геолокацию или добавьте город вручную.</p>`;
    return;
  }
  for (const city of savedCities) {
    const card = createCityCard(city);
    weatherContainer.appendChild(card);
    loadForecastForCard(city, card);
  }
}

async function refreshAll() {
  const cards = document.querySelectorAll(".weather-card");
  for (const card of cards) {
    const city = savedCities.find(c => c.id === card.dataset.id);
    if (city) await loadForecastForCard(city, card);
  }
}
refreshBtn.addEventListener("click", refreshAll);

async function handleAddCity() {
  const name = cityInput.value.trim();
  if (!name) { cityError.textContent = "Введите название города"; return; }

  try {
    if (selectedSuggestion && selectedSuggestion.displayName === name) {
      const best = selectedSuggestion;
      if (savedCities.some(c => Math.abs(c.lat - best.lat)<1e-6 && Math.abs(c.lon - best.lon)<1e-6)) {
        cityError.textContent = "Этот город уже добавлен."; return;
      }
      savedCities.push({ id: uid(), name: best.name, displayName: best.displayName, lat: best.lat, lon: best.lon, isGeo:false });
      saveCities(); cityInput.value=""; selectedSuggestion=null; cityError.textContent=""; renderAll();
      return;
    }

    cityError.textContent = "Проверка...";
    const geo = await geocodeCity(name);
    if (!geo.results || geo.results.length===0) { cityError.textContent="Город не найден."; return; }
    const best = geo.results[0];
    const displayName = `${best.name}${best.admin1?", "+best.admin1:""}${best.country?", "+best.country:""}`;
    if (savedCities.some(c=>Math.abs(c.lat-best.latitude)<1e-6 && Math.abs(c.lon-best.longitude)<1e-6)) {
      cityError.textContent = "Этот город уже добавлен."; return;
    }
    savedCities.push({ id: uid(), name: best.name, displayName, lat:best.latitude, lon:best.longitude, isGeo:false });
    saveCities(); cityInput.value=""; cityError.textContent=""; renderAll();
  } catch(err) { cityError.textContent="Ошибка сети"; console.error(err); }
}
addCityBtn.addEventListener("click", handleAddCity);
cityInput.addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();handleAddCity();}});

function init() {
  if (savedCities.length===0 && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async pos=>{
      try {
        const lat = pos.coords.latitude; 
        const lon = pos.coords.longitude;

        let display = "Текущее местоположение";
        try {
          const rev=await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=ru`);
          const data=await rev.json();
          if(data.results && data.results[0]){
            const r = data.results[0];
            display = `${r.name}${r.admin1?", "+r.admin1:""}${r.country?", "+r.country:""}`;
          }
        } catch {}

        const city = { id: uid(), name: "geo", displayName: display, lat, lon, isGeo:true };
        savedCities.push(city); 
        saveCities();

        const card = createCityCard(city);
        weatherContainer.appendChild(card);
        await loadForecastForCard(city, card);
      } catch(e){
        console.warn("Геолокация или обратный геокодинг не удались", e);
        renderAll();
      }
    }, err=>{
      console.log("Геолокация недоступна", err);
      renderAll();
    }, {timeout:8000});
  } else {
    renderAll();
  }
}

init();