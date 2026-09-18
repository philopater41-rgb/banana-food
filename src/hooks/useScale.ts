'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseScaleLine, ScaleBufferAccumulator, ParsedScaleData } from '@/lib/scaleParser';

export interface UseScaleReturn {
  isSupported: boolean;
  isConnected: boolean;
  currentWeight: number; // Net weight in kg
  rawWeight: number;     // Gross weight from scale
  isStable: boolean;
  isZero: boolean;
  lastPacket: ParsedScaleData | null;
  rawTerminalLines: string[];
  baudRate: number;
  error: string | null;
  connectScale: () => Promise<boolean>;
  disconnectScale: () => Promise<void>;
  setBaudRate: (rate: number) => void;
  tare: () => void;
  zero: () => void;
  simulateWeight: (weight: number) => void;
}

export function useScale(): UseScaleReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [rawWeight, setRawWeight] = useState<number>(0);
  const [isStable, setIsStable] = useState<boolean>(true);
  const [isZero, setIsZero] = useState<boolean>(true);
  const [lastPacket, setLastPacket] = useState<ParsedScaleData | null>(null);
  const [rawTerminalLines, setRawTerminalLines] = useState<string[]>([]);
  const [baudRate, setBaudRateState] = useState<number>(9600);
  const [error, setError] = useState<string | null>(null);
  const [tareOffset, setTareOffset] = useState<number>(0);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef<boolean>(false);
  const accumulatorRef = useRef<ScaleBufferAccumulator>(new ScaleBufferAccumulator());

  // Check Web Serial API support
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serial' in navigator) {
      setIsSupported(true);
    }
    const savedBaud = localStorage.getItem('scale_baud_rate');
    if (savedBaud) {
      const parsed = parseInt(savedBaud, 10);
      if (!isNaN(parsed)) setBaudRateState(parsed);
    }
  }, []);

  const appendTerminalLine = useCallback((line: string) => {
    setRawTerminalLines((prev) => {
      const updated = [...prev, line];
      return updated.slice(-15); // keep last 15 lines for terminal monitor
    });
  }, []);

  // Continuous read loop
  const startReading = useCallback(async (port: any) => {
    keepReadingRef.current = true;
    accumulatorRef.current.clear();

    while (port.readable && keepReadingRef.current) {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      try {
        while (keepReadingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const lines = accumulatorRef.current.pushChunk(value);
            for (const line of lines) {
              appendTerminalLine(line);
              const parsed = parseScaleLine(line);
              if (parsed) {
                setLastPacket(parsed);
                setRawWeight(parsed.weight);
                const net = Math.max(0, Math.round((parsed.weight - tareOffset) * 1000) / 1000);
                setCurrentWeight(net);
                setIsStable(parsed.isStable);
                setIsZero(net < 0.005);
              }
            }
          }
        }
      } catch (err: any) {
        if (keepReadingRef.current) {
          console.error('Scale reading stream error:', err);
          setError(err.message || 'انقطع الاتصال بالميزان');
        }
      } finally {
        reader.releaseLock();
        await readableStreamClosed.catch(() => {});
      }
    }
  }, [appendTerminalLine, tareOffset]);

  // Connect Scale
  const connectScale = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (typeof window === 'undefined' || !('serial' in navigator)) {
      setError('المتصفح لا يدعم Web Serial API. يرجى استخدام Google Chrome أو Microsoft Edge.');
      return false;
    }

    try {
      // Clean up previous port/reader if any
      if (portRef.current) {
        try {
          keepReadingRef.current = false;
          if (readerRef.current) {
            await readerRef.current.cancel().catch(() => {});
            readerRef.current = null;
          }
          await portRef.current.close().catch(() => {});
        } catch {}
        portRef.current = null;
      }

      const navSerial = (navigator as any).serial;
      const port = await navSerial.requestPort();
      if (!port) return false;

      // If the selected port is already open
      if (port.readable) {
        portRef.current = port;
        setIsConnected(true);
        startReading(port);
        return true;
      }

      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });

      portRef.current = port;
      setIsConnected(true);
      localStorage.setItem('scale_auto_connect', 'true');

      // Start reading stream in background
      startReading(port);
      return true;
    } catch (err: any) {
      console.error('Failed to open serial port:', err);
      // User cancelled port picker
      if (err.name === 'NotFoundError') {
        return false;
      }
      if (err.message && err.message.includes('Failed to open serial port')) {
        setError('المنفذ محجوز حالياً بواسطة تبويب آخر أو جلسة سابقة. افصل كابل الـ USB وركبه مرة ثانية، وأغلق أي تبويب آخر للبرنامج.');
      } else {
        setError(err.message || 'تعذر فتح منفذ الميزان. تأكد من إغلاق أي برنامج آخر يستخدم المنفذ.');
      }
      return false;
    }
  }, [baudRate, startReading]);

  // Disconnect Scale
  const disconnectScale = useCallback(async () => {
    keepReadingRef.current = false;
    localStorage.removeItem('scale_auto_connect');

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {}
      readerRef.current = null;
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch {}
      portRef.current = null;
    }

    setIsConnected(false);
    setCurrentWeight(0);
    setRawWeight(0);
    setLastPacket(null);
  }, []);

  // Update baud rate
  const setBaudRate = useCallback((rate: number) => {
    setBaudRateState(rate);
    localStorage.setItem('scale_baud_rate', String(rate));
    if (isConnected) {
      disconnectScale().then(() => {
        // Will need user re-open if changed
      });
    }
  }, [isConnected, disconnectScale]);

  // Software Tare
  const tare = useCallback(() => {
    setTareOffset(rawWeight);
    setCurrentWeight(0);
    setIsZero(true);
  }, [rawWeight]);

  // Software Zero
  const zero = useCallback(() => {
    setTareOffset(0);
    setCurrentWeight(rawWeight);
    setIsZero(rawWeight < 0.005);
  }, [rawWeight]);

  // Simulation mode for testing UI without physical cable
  const simulateWeight = useCallback((w: number) => {
    const net = Math.max(0, Math.round(w * 1000) / 1000);
    setRawWeight(net);
    setCurrentWeight(net);
    setIsStable(true);
    setIsZero(net < 0.005);
    setIsConnected(true);
    appendTerminalLine(`SIMULATED: ST,GS,+  ${net.toFixed(3)}kg`);
  }, [appendTerminalLine]);

  // Auto-connect to previously granted port on load
  useEffect(() => {
    if (typeof window === 'undefined' || !('serial' in navigator)) return;
    const shouldAutoConnect = localStorage.getItem('scale_auto_connect') === 'true';
    if (!shouldAutoConnect) return;

    const navSerial = (navigator as any).serial;
    navSerial.getPorts().then(async (ports: any[]) => {
      if (ports.length > 0 && !portRef.current) {
        try {
          const p = ports[0];
          if (p.readable) {
            portRef.current = p;
            setIsConnected(true);
            startReading(p);
            return;
          }
          await p.open({
            baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
          });
          portRef.current = p;
          setIsConnected(true);
          startReading(p);
        } catch (e) {
          console.warn('Auto reconnect scale port failed:', e);
        }
      }
    });

    return () => {
      keepReadingRef.current = false;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      if (portRef.current) {
        portRef.current.close().catch(() => {});
        portRef.current = null;
      }
    };
  }, [baudRate, startReading]);

  return {
    isSupported,
    isConnected,
    currentWeight,
    rawWeight,
    isStable,
    isZero,
    lastPacket,
    rawTerminalLines,
    baudRate,
    error,
    connectScale,
    disconnectScale,
    setBaudRate,
    tare,
    zero,
    simulateWeight,
  };
}
