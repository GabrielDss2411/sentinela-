import { useEffect, useState } from 'react';

/** Current time, refreshed every `stepMs`. */
export function useClock(stepMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR');
