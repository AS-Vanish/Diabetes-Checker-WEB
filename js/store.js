// History persistence in localStorage only. Nothing is ever transmitted.
const KEY = "dc.history.v2", MAX = 50;

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
export const storageAvailable = () => safe(() => { localStorage.setItem("dc.__t", "1"); localStorage.removeItem("dc.__t"); return true; }, false);

export function loadHistory() {
  return safe(() => {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data) ? data.filter((e) => e && e.id && e.inputs && Array.isArray(e.results)) : [];
  }, []);
}
function persist(list) { return safe(() => { localStorage.setItem(KEY, JSON.stringify(list)); return true; }, false); }

/** entry: {inputs:{key:number}, results:[{id,name,prob,threshold,positive,ms}], mode, thresholdMode} */
export function addEntry(entry) {
  const list = loadHistory();
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), ...entry };
  list.unshift(e);
  return persist(list.slice(0, MAX)) ? e : null;
}
export function removeEntry(id) { return persist(loadHistory().filter((e) => e.id !== id)); }
export function clearHistory() { return safe(() => { localStorage.removeItem(KEY); return true; }, false); }
export const historyLimit = MAX;
