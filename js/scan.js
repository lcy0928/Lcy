// Barcode scanning. Chrome on Android has a built-in BarcodeDetector; Safari
// does not, so a ZXing WebAssembly ponyfill is loaded from jsDelivr on first use.

const PONYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/ponyfill.min.js';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];

let detectorPromise = null;

export function getDetector() {
  detectorPromise ||= (async () => {
    if ('BarcodeDetector' in globalThis) {
      try {
        const supported = await globalThis.BarcodeDetector.getSupportedFormats();
        if (supported.includes('ean_13')) {
          return new globalThis.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        }
      } catch {
        /* fall through to the ponyfill */
      }
    }
    const { BarcodeDetector } = await import(PONYFILL);
    return new BarcodeDetector({ formats: FORMATS });
  })();
  detectorPromise.catch(() => { detectorPromise = null; });
  return detectorPromise;
}

/** Product codes are digits; QR codes may carry a link or text. */
export function cleanCode(raw) {
  const s = String(raw || '').trim();
  return /^\d{8,14}$/.test(s) ? s : s.slice(0, 200);
}

/**
 * Start the rear camera in `video` and resolve with the first code seen.
 * Call the returned stop() to release the camera.
 */
export function startScan(video, onCode, onError) {
  let stream = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
  };
  (async () => {
    try {
      const detector = await getDetector();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (stopped) return stop();
      video.srcObject = stream;
      await video.play();
      while (!stopped) {
        if (video.readyState >= 2) {
          const found = await detector.detect(video).catch(() => []);
          if (found.length && !stopped) {
            stop();
            onCode(cleanCode(found[0].rawValue));
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      stop();
      onError(e);
    }
  })();
  return stop;
}

/** Read a code from a photo (fallback when live camera is unavailable). */
export async function scanFile(file) {
  const detector = await getDetector();
  const bitmap = await createImageBitmap(file);
  const found = await detector.detect(bitmap);
  return found.length ? cleanCode(found[0].rawValue) : '';
}
