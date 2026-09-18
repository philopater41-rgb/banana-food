/**
 * Universal RS232 Electronic Scale Parser & Stream Buffer
 * Supports CAS, Yaohua (XK3190/A12), Rongta, Toledo, and Generic continuous ASCII scales.
 */

export interface ParsedScaleData {
  weight: number;      // in Kilograms (kg), rounded to 3 decimals (e.g. 1.250)
  rawWeight: number;   // original number before conversion
  unit: 'kg' | 'g' | 'lb';
  isStable: boolean;
  isZero: boolean;
  raw: string;
}

export function parseScaleLine(line: string): ParsedScaleData | null {
  if (!line) return null;
  const rawClean = line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  if (!rawClean) return null;

  let isStable = true;
  if (/US\b/i.test(rawClean) || /UNSTABLE/i.test(rawClean)) {
    isStable = false;
  } else if (/ST\b/i.test(rawClean) || /STABLE/i.test(rawClean)) {
    isStable = true;
  }

  // Ignore print ticket metadata lines (e.g. NO. 001, DATE, TIME, TICKET, SEQ)
  if (/^(?:no\.?|date|time|ticket|item|accu|count|seq)\b/i.test(rawClean)) {
    return null;
  }

  // Detect unit (kg, g, lb)
  let unit: 'kg' | 'g' | 'lb' = 'kg';
  if (/kg\b|kilo|كجم|كيلو/i.test(rawClean)) {
    unit = 'kg';
  } else if (/(?:^|\d|\s)(?:g|gm|جرام)(?:\b|$|[^\w])/i.test(rawClean)) {
    unit = 'g';
  } else if (/\b(?:lb|lbs|رطل)\b/i.test(rawClean)) {
    unit = 'lb';
  } else {
    unit = 'kg';
  }

  // 0. Explicit Net / Gross / Weight labels (Common in Yaohua manual print tickets: N.W: 6.30kg, Gross: 6.30kg)
  let numMatch = rawClean.match(/(?:N\.?W\.?|NET|G\.?W\.?|GROSS|WEIGHT|WN|WT|GS|NT)\s*[:=]?\s*([+-]?\s*\d+(?:\.\d+)?)/i);

  // 1. Yaohua / XK3190 Format: =01.250(kg) or (01.250) or ww01.250kg
  if (!numMatch) {
    numMatch = rawClean.match(/=\s*([+-]?\d+(?:\.\d+)?)/);
  }
  
  // 2. CAS / Rongta / Standard Format: ST,GS,+  1.250kg or WN+01.250KG
  if (!numMatch) {
    numMatch = rawClean.match(/(?:GS|NT|WN|WT|ww|wn)?\s*[,\s]*([+-]?\s*\d+(?:\.\d+)?)\s*(?:kg|g|lb)?/i);
  }

  // 3. Parentheses format: (  1.250)
  if (!numMatch) {
    numMatch = rawClean.match(/\(\s*([+-]?\d+(?:\.\d+)?)\s*\)/);
  }

  // 4. Generic float search: any standalone signed float
  if (!numMatch) {
    numMatch = rawClean.match(/([+-]?\d+\.\d{1,4})/);
  }

  // 5. Fallback integer (e.g. 500g)
  if (!numMatch) {
    numMatch = rawClean.match(/([+-]?\d+)/);
  }

  if (!numMatch || !numMatch[1]) return null;

  const rawNumStr = numMatch[1].replace(/\s+/g, '');
  const parsedNum = parseFloat(rawNumStr);
  if (isNaN(parsedNum)) return null;

  // Convert to Kilograms if unit is grams or lbs
  let weightInKg = parsedNum;
  if (unit === 'g') {
    weightInKg = parsedNum / 1000;
  } else if (unit === 'lb') {
    weightInKg = parsedNum * 0.45359237;
  }

  // Round to 3 decimal places (1 gram accuracy: 0.001 kg)
  weightInKg = Math.round(weightInKg * 1000) / 1000;

  const isZero = Math.abs(weightInKg) < 0.005;

  return {
    weight: Math.max(0, weightInKg),
    rawWeight: parsedNum,
    unit,
    isStable,
    isZero,
    raw: rawClean,
  };
}

/**
 * Accumulator for serial stream chunks to produce clean lines
 */
export class ScaleBufferAccumulator {
  private buffer: string = '';

  /**
   * Appends newly received chunk and returns any fully delimited lines
   */
  public pushChunk(chunk: string): string[] {
    this.buffer += chunk;

    // Split on standard line terminators \r\n, \r, \n, or ETX (0x03)
    const lines: string[] = [];
    const parts = this.buffer.split(/[\r\n\x03]+/);

    // Keep the last partial piece in buffer if it didn't end with a delimiter
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        const trimmed = parts[i].trim();
        if (trimmed) lines.push(trimmed);
      }
      this.buffer = parts[parts.length - 1];
    }

    // Safety guard to avoid memory leak if no delimiter ever arrives
    if (this.buffer.length > 256) {
      this.buffer = this.buffer.slice(-64);
    }

    return lines;
  }

  public clear(): void {
    this.buffer = '';
  }
}
