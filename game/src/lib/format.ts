export const kToC = (k: number) => Math.round(k - 273.15);

export function temp(k: number) {
  return `${Math.round(k)} K · ${kToC(k)} °C`;
}

/** 37.7 → "1 d 13.7 h", 5.2 → "5.2 h" */
export function hours(h: number) {
  if (!Number.isFinite(h)) return "—";
  if (h < 48) return `${h.toFixed(1)} h`;
  const d = Math.floor(h / 24);
  const r = h - d * 24;
  return `${d} d ${Math.round(r)} h`;
}

export function km(v: number) {
  if (!Number.isFinite(v)) return "—";
  return v >= 1000 ? `${Math.round(v).toLocaleString("en-US")} km` : `${v.toFixed(1)} km`;
}

export function pct(v: number) {
  return `${Math.round(v)}%`;
}

export function coords(lat: number, lon: number) {
  const ns = lat < 0 ? "S" : "N";
  const ew = lon < 0 ? "W" : "E";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
