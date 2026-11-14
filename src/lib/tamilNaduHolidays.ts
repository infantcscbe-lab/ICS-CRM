/**
 * Official Tamil Nadu Government Public Holidays Calendar
 * Based on Government of Tamil Nadu Public (Miscellaneous) Department Gazetted Holidays
 * & Negotiable Instruments Act (N.I. Act)
 */

export interface TamilNaduHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  tamilName?: string;
  dayOfWeek?: string;
  isRestricted?: boolean;
}

/**
 * Gazetted Public Holidays for Tamil Nadu (2025 & 2026 & recurring annual festivals)
 */
export const TAMIL_NADU_HOLIDAYS_REGISTRY: Record<string, string> = {
  // ── 2025 Tamil Nadu Public Holidays ──
  '2025-01-01': "New Year's Day",
  '2025-01-14': 'Pongal',
  '2025-01-15': 'Thiruvalluvar Day',
  '2025-01-16': 'Uzhavar Thirunal',
  '2025-01-26': 'Republic Day',
  '2025-02-11': 'Thai Poosam',
  '2025-03-31': 'Ramzan (Id-ul-Fitr)',
  '2025-04-14': 'Tamil New Year & Dr. B.R. Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'May Day (Labour Day)',
  '2025-06-07': 'Bakrid (Eid-al-Adha)',
  '2025-07-06': 'Muharram',
  '2025-08-15': 'Independence Day',
  '2025-08-16': 'Krishna Jayanti',
  '2025-08-27': 'Vinayakar Chathurthi',
  '2025-09-05': 'Milad-un-Nabi',
  '2025-10-01': 'Ayutha Pooja / Saraswathi Pooja',
  '2025-10-02': 'Gandhi Jayanti / Vijaya Dasami',
  '2025-10-20': 'Deepavali',
  '2025-12-25': 'Christmas',

  // ── 2026 Tamil Nadu Public Holidays ──
  '2026-01-01': "New Year's Day",
  '2026-01-14': 'Pongal',
  '2026-01-15': 'Thiruvalluvar Day',
  '2026-01-16': 'Uzhavar Thirunal',
  '2026-01-26': 'Republic Day',
  '2026-02-01': 'Thai Poosam',
  '2026-03-21': 'Ramzan (Id-ul-Fitr)',
  '2026-03-24': 'Telugu New Year',
  '2026-03-31': 'Mahaveer Jayanthi',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Tamil New Year & Dr. B.R. Ambedkar Jayanti',
  '2026-05-01': 'May Day (Labour Day)',
  '2026-05-28': 'Bakrid (Eid-al-Adha)',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-08-26': 'Milad-un-Nabi',
  '2026-09-04': 'Krishna Jayanti',
  '2026-09-14': 'Vinayakar Chathurthi',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-19': 'Ayutha Pooja / Saraswathi Pooja',
  '2026-10-20': 'Vijaya Dasami',
  '2026-11-08': 'Deepavali',
  '2026-12-25': 'Christmas',

  // ── 2027 Tamil Nadu Standard Fixed Public Holidays ──
  '2027-01-01': "New Year's Day",
  '2027-01-14': 'Pongal',
  '2027-01-15': 'Thiruvalluvar Day',
  '2027-01-16': 'Uzhavar Thirunal',
  '2027-01-26': 'Republic Day',
  '2027-04-14': 'Tamil New Year & Dr. B.R. Ambedkar Jayanti',
  '2027-05-01': 'May Day (Labour Day)',
  '2027-08-15': 'Independence Day',
  '2027-10-02': 'Gandhi Jayanti',
  '2027-12-25': 'Christmas',
};

/**
 * Fixed recurring annual holidays in Tamil Nadu (matched by MM-DD if not explicitly in registry)
 */
export const ANNUAL_FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': "New Year's Day",
  '01-14': 'Pongal',
  '01-15': 'Thiruvalluvar Day',
  '01-16': 'Uzhavar Thirunal',
  '01-26': 'Republic Day',
  '04-14': 'Tamil New Year & Dr. B.R. Ambedkar Jayanti',
  '05-01': 'May Day (Labour Day)',
  '08-15': 'Independence Day',
  '10-02': 'Gandhi Jayanti',
  '12-25': 'Christmas',
};

/**
 * Checks if a specific date (YYYY-MM-DD) is a Tamil Nadu Government Holiday.
 */
export function getTamilNaduHoliday(dateStr: string): TamilNaduHoliday | null {
  if (!dateStr) return null;
  const directMatch = TAMIL_NADU_HOLIDAYS_REGISTRY[dateStr];
  if (directMatch) {
    return {
      date: dateStr,
      name: directMatch,
    };
  }

  // Check recurring fixed holidays (MM-DD)
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthDay = `${parts[1]}-${parts[2]}`;
    const fixedMatch = ANNUAL_FIXED_HOLIDAYS[monthDay];
    if (fixedMatch) {
      return {
        date: dateStr,
        name: fixedMatch,
      };
    }
  }

  return null;
}

/**
 * Checks if a given date string or Date is a Sunday (Standard Weekly Off).
 */
export function isSundayWeekOff(dateInput: string | Date): boolean {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.getDay() === 0;
    }
    return new Date(dateInput).getDay() === 0;
  }
  return dateInput.getDay() === 0;
}

/**
 * Evaluates whether a day is a Tamil Nadu Government Holiday, Sunday Week-off, or Working Day.
 */
export function evaluateCalendarDay(dateStr: string): {
  isNonWorking: boolean;
  type: 'sunday_weekoff' | 'govt_holiday' | 'working_day';
  badgeCode: 'WO' | 'GH' | 'WD';
  holidayName?: string;
  description: string;
} {
  const tnHoliday = getTamilNaduHoliday(dateStr);
  if (tnHoliday) {
    return {
      isNonWorking: true,
      type: 'govt_holiday',
      badgeCode: 'GH',
      holidayName: tnHoliday.name,
      description: `Tamil Nadu Govt Holiday: ${tnHoliday.name}`,
    };
  }

  if (isSundayWeekOff(dateStr)) {
    return {
      isNonWorking: true,
      type: 'sunday_weekoff',
      badgeCode: 'WO',
      description: 'Sunday Weekly Off',
    };
  }

  return {
    isNonWorking: false,
    type: 'working_day',
    badgeCode: 'WD',
    description: 'Working Day',
  };
}

/**
 * Returns all Tamil Nadu Government Holidays in a given month.
 */
export function getTamilNaduHolidaysForMonth(year: number, month: number): TamilNaduHoliday[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStr = String(month + 1).padStart(2, '0');
  const result: TamilNaduHoliday[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    const hol = getTamilNaduHoliday(dateStr);
    if (hol) {
      result.push(hol);
    }
  }

  return result;
}
