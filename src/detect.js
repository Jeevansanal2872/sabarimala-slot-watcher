'use strict';
/**
 * Slot detection for Virtual Q Detector. Pure functions, no Electron dependency, so it can be unit-tested with plain node.
 *
 * findSlots(json, { dates: ['2026-12-20', ...], minSlots: 6 }) -> [{ date, key, count, text }]
 *
 * Heuristic (the site's real JSON shape is unknown to us):
 *  - a "context date" is any target date found in a string/epoch value of an object (or as an object key)
 *  - inside that context, a numeric field whose name looks like an availability count and is >= minSlots is a hit
 *  - totals / capacities / booked counts are ignored
 *  - a status like "Available"/"Open" (count unknown) is reported as a hit too
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Sabarimala site uses keys like: availableCount, noOfAvailability, quota, slotsAvailable, slotBalance
const COUNT_KEY = /avail|remain|vacan|balance|left|slot|seat|count|quota|capacity_left|noOf|no_of/i;
const EXCLUDE_KEY = /total|max|capacity$|limit|booked|used|sold|reserved|price|amount|fee|id$|year|month|day$|routeId|userId/i;
const STATUS_KEY = /status|state|availab|bookable|open|isOpen|isAvail/i;
const OPEN_VALUE = /^\s*(available|open|vacant|bookable|slots?\s+available|few\s+left|filling\s+fast|Y|yes|true|1)\s*$/i;
const BOOL_KEY = /avail|bookable|open|vacan|isOpen|isAvail/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a case-insensitive regex that matches many spellings of an ISO date (YYYY-MM-DD). */
function dateRegex(iso) {
  const [y, m, d] = iso.split('-');
  const d1 = String(+d);
  const m1 = String(+m);
  const numeric = [
    `${y}-${m}-${d}`, `${y}/${m}/${d}`, `${d}-${m}-${y}`, `${d}/${m}/${y}`,
    `${d}.${m}.${y}`, `${d1}/${m1}/${y}`, `${d1}-${m1}-${y}`,
  ].map(escapeRe);
  const mon = MONTHS[+m - 1];
  const words = [
    `\\b0?${d1}(?:st|nd|rd|th)?\\s+${mon}[a-z]*\\.?,?\\s*(?:${y})?`, // 20 Dec 2026
    `\\b${mon}[a-z]*\\.?\\s+0?${d1}(?:st|nd|rd|th)?\\b`,            // Dec 20, 2026
  ];
  return new RegExp(`(?<!\\d)(?:${numeric.join('|')})(?!\\d)|${words.join('|')}`, 'i');
}

function epochToIstIso(n) {
  let ms = null;
  if (n >= 1e9 && n < 1e11) ms = n * 1000;       // seconds
  else if (n >= 1e12 && n < 4e12) ms = n;        // milliseconds
  if (ms === null) return null;
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function prettyDate(iso) {
  const [, m, d] = iso.split('-');
  return `${MONTHS[+m - 1][0].toUpperCase()}${MONTHS[+m - 1].slice(1)} ${+d}`;
}

function findSlots(data, opts) {
  const dates = (opts && opts.dates) || [];
  const minSlots = (opts && opts.minSlots) || 1;
  const matchers = dates.map((iso) => ({ iso, re: dateRegex(iso) }));
  const hits = [];
  const seen = new Set();

  const dateOfString = (s) => {
    for (const m of matchers) if (m.re.test(s)) return m.iso;
    return null;
  };
  const dateOfValue = (v) => {
    if (typeof v === 'string') return dateOfString(v);
    if (typeof v === 'number') {
      const iso = epochToIstIso(v);
      return iso && dates.includes(iso) ? iso : null;
    }
    return null;
  };

  function add(date, key, value, note) {
    const id = `${date}|${key}|${value}`;
    if (seen.has(id)) return;
    seen.add(id);
    const text = note
      ? `${prettyDate(date)}: ${key} = ${value} (${note})`
      : `${prettyDate(date)}: ${key} = ${value}`;
    hits.push({ date, key, count: typeof value === 'number' ? value : null, text });
  }

  function visit(node, inherited, depth) {
    if (depth > 40 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x, inherited, depth + 1);
      return;
    }
    let own = null;
    for (const v of Object.values(node)) {
      own = dateOfValue(v);
      if (own) break;
    }
    const ctx = own || inherited;

    for (const [k, v] of Object.entries(node)) {
      const keyDate = dateOfString(k);
      const childCtx = keyDate || ctx;

      if (typeof v === 'number' && Number.isFinite(v)) {
        if (keyDate && v >= minSlots) add(keyDate, 'slots', v);
        else if (ctx && COUNT_KEY.test(k) && !EXCLUDE_KEY.test(k) && v >= minSlots) add(ctx, k, v);
      } else if (typeof v === 'string') {
        if (ctx && COUNT_KEY.test(k) && !EXCLUDE_KEY.test(k) && /^\d{1,6}$/.test(v.trim()) && +v >= minSlots) {
          add(ctx, k, +v);
        } else if (ctx && STATUS_KEY.test(k) && OPEN_VALUE.test(v)) {
          add(ctx, k, v.trim(), 'count not shown');
        }
      } else if (v === true) {
        if (ctx && BOOL_KEY.test(k) && !EXCLUDE_KEY.test(k)) add(ctx, k, 'true', 'count not shown');
      } else if (v && typeof v === 'object') {
        visit(v, childCtx, depth + 1);
      }
    }
  }

  visit(data, null, 0);
  return hits;
}

module.exports = { findSlots, dateRegex, prettyDate };

