// Read prices off a photo of a price tag with Tesseract.js (loaded on demand,
// English digits model only to keep the download small). Runs on the phone.

const SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const SYMBOLS = { 'HK$': 'HKD', '£': 'GBP', '€': 'EUR', 'US$': 'USD', '¥': 'JPY', '$': '' };

let loading = null;
function loadTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => { loading = null; reject(new Error('Could not load the text reader')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** "1.299,00" → 1299, "12,99" → 12.99, "1,299" → 1299, "1.299" → 1299, "12.5" → 12.5 */
export function parseAmount(s) {
  let t = String(s).replace(/\s/g, '');
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal point.
    t = lastDot > lastComma ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // prices are rarely written to three decimals
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

const PRICE_RE = /(HK\$|US\$|£|€|¥|\$)?\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(€)?/g;

/**
 * Price candidates from OCR words, biggest text first (the price is usually the largest print).
 * @param words [{text, height}]
 * @returns [{value, currency}]
 */
export function priceCandidates(input) {
  // OCR often splits the symbol from the number ("39,99" "€"): glue lone symbols on.
  const words = input.map((w) => ({ ...w }));
  for (let i = 0; i < words.length; i++) {
    const sym = String(words[i].text).trim();
    if (!/^(HK\$|US\$|£|€|¥|\$)$/.test(sym)) continue;
    const prev = words[i - 1];
    const next = words[i + 1];
    if (sym === '€' && prev && /\d$/.test(prev.text)) prev.text += ' €';
    else if (next && /^\d/.test(next.text)) next.text = sym + next.text;
    else if (prev && /\d$/.test(prev.text)) prev.text += ` ${sym}`;
  }
  const seen = new Map();
  for (const w of words) {
    for (const m of String(w.text).matchAll(PRICE_RE)) {
      const value = parseAmount(m[2]);
      if (!(value > 0) || value > 1e6) continue;
      // Bare small integers (sizes, quantities) need a symbol or decimals to count.
      if (!m[1] && !m[3] && !/[.,]\d{1,2}$/.test(m[2]) && value < 10) continue;
      const currency = SYMBOLS[m[1]] ?? (m[3] ? 'EUR' : '');
      const key = value.toFixed(2);
      const prev = seen.get(key);
      const score = (w.height || 0) + (currency ? 1000 : 0);
      if (!prev || score > prev.score) seen.set(key, { value, currency: currency || prev?.currency || '', score });
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6).map(({ value, currency }) => ({ value, currency }));
}

// Grey, contrast-boosted copy of the photo with its longest side at `max` px.
function prepare(bitmap, max) {
  const scale = max / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.4)';
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

/**
 * Tesseract reads best when letters are ~20–40 px tall, but a shelf price is
 * often far bigger than the small print. Read the photo at two sizes and merge.
 * @returns {Promise<{value:number, currency:string}[]>}
 */
export async function readPrices(file, onProgress = () => {}) {
  const Tesseract = await loadTesseract();
  const bitmap = await createImageBitmap(file);
  // Full size (capped at 1600 px), then roughly half and a quarter for big print.
  const full = Math.min(1600, Math.max(bitmap.width, bitmap.height));
  const passes = [full, full * 0.45, full * 0.22].map(Math.round).filter((m) => m >= 160);
  let pass = 0;
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => { if (m.status === 'recognizing text') onProgress((pass + m.progress) / passes.length); },
  });
  try {
    // Sparse-text mode: a price tag is scattered words, not a paragraph.
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const words = [];
    for (const max of passes) {
      const { canvas, scale } = prepare(bitmap, max);
      const { data } = await worker.recognize(canvas);
      // Heights back in original pixels so both passes rank on the same scale.
      for (const w of data.words || []) words.push({ text: w.text, height: w.bbox ? (w.bbox.y1 - w.bbox.y0) / scale : 0 });
      pass++;
    }
    return priceCandidates(words);
  } finally {
    await worker.terminate();
  }
}
