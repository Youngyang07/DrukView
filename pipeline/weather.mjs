import { fetchJson } from './lib.mjs';

export const SOURCE = {
  id: 'weather',
  name: 'Open-Meteo – daily weather (temperature, rainfall)',
  url: 'https://open-meteo.com/',
  kind: 'api',
  notes: 'Modelled weather for each dzongkhag headquarters town (approximate point), not a ground-station record. Last 14 days plus a 7-day forecast.',
};

export function openMeteoUrl(dzs) {
  const lat = dzs.map(d => d.lat).join(','), lon = dzs.map(d => d.lon).join(',');
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&past_days=14&forecast_days=7&timezone=Asia%2FThimphu`;
}

/** dzs: [{id, lat, lon}] in the same order sent to the API. today: 'YYYY-MM-DD' in Bhutan time. */
export function parseOpenMeteo(json, dzs, today, fetchedAt) {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length !== dzs.length) throw new Error(`Open-Meteo returned ${arr.length} locations, expected ${dzs.length}`);
  const rows = [];
  arr.forEach((loc, i) => {
    const d = loc?.daily; if (!d?.time) return;
    d.time.forEach((date, k) => rows.push({ dzongkhag: dzs[i].id, date, tmax_c: d.temperature_2m_max?.[k] ?? null, tmin_c: d.temperature_2m_min?.[k] ?? null,
      precip_mm: d.precipitation_sum?.[k] ?? null, is_forecast: date > today, fetched_at: fetchedAt }));
  });
  return rows;
}

export async function fetchWeather(dzs) {
  const json = await fetchJson(openMeteoUrl(dzs));
  const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Bhutan Standard Time = UTC+6
  const rows = parseOpenMeteo(json, dzs, today, new Date().toISOString());
  if (!rows.length) throw new Error('Open-Meteo returned no daily data');
  return rows;
}
