// Calendar navigation state shared by the Goals and Tasks screens.
import { useMemo, useState } from 'react';

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
  const today = todayISO();
  const [scope, setScope] = useState<Timeframe>('day');
  const [refDate, setRefDate] = useState<string>(today);

  const weekDays = useMemo(
    () => enumerateDates(startOfWeek(refDate), endOfWeek(refDate)),
    [refDate],
  );

  const stepPeriod = (dir: 1 | -1) =>
    setRefDate(
      scope === 'day' ? addDays(refDate, dir) : scope === 'week' ? addDays(refDate, dir * 7) : addMonths(refDate, dir),
    );

  const goToday = () => setRefDate(today);

  return { today, scope, setScope, refDate, setRefDate, weekDays, stepPeriod, goToday };
}
