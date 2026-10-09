// Calendar navigation state shared by the Goals and Tasks screens.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { Timeframe } from '../../core/domain';
import { addDays, endOfWeek, enumerateDates, startOfWeek, todayISO } from '../../core/logic';
import { addMonths } from './format';

export interface Calendar {
  today: string;
  scope: Timeframe;
  setScope: (tf: Timeframe) => void;
  refDate: string;
  setRefDate: (d: string) => void;
  weekDays: string[];
  stepPeriod: (dir: 1 | -1) => void;
  goToday: () => void;
}

export function useCalendar(): Calendar {
  const [today, setToday] = useState(todayISO);
  const todayRef = useRef(today);
  const [scope, setScope] = useState<Timeframe>('day');
  const [refDate, setRefDate] = useState<string>(today);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const next = todayISO();
      const previous = todayRef.current;
      if (next !== previous) {
        todayRef.current = next;
        setToday(next);
        setRefDate((current) => current === previous ? next : current);
      }
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(1, nextMidnight.getTime() - now.getTime() + 25));
    };
    const onVisible = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh(); };
    const appState = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    schedule();
    return () => {
      clearTimeout(timer);
      appState?.remove();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const weekDays = useMemo(
    () => enumerateDates(startOfWeek(refDate), endOfWeek(refDate)),
    [refDate],
  );

  const stepPeriod = useCallback((dir: 1 | -1) =>
    setRefDate((current) =>
      scope === 'day' ? addDays(current, dir) : scope === 'week' ? addDays(current, dir * 7) : addMonths(current, dir),
    ), [scope]);

  const goToday = () => {
    setScope('day');
    setRefDate(today);
  };

  return { today, scope, setScope, refDate, setRefDate, weekDays, stepPeriod, goToday };
}
