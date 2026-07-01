'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface MonthYearPickerProps {
  month: number;
  year: number;
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function MonthYearPicker({ month, year }: MonthYearPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleDateChange = (newMonth: number, newYear: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth.toString());
    params.set('year', newYear.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePrevMonth = () => {
    let newMonth = month - 1;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    handleDateChange(newMonth, newYear);
  };

  const handleNextMonth = () => {
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    handleDateChange(newMonth, newYear);
  };

  return (
    <div className="flex items-center justify-between glass-card p-2 px-4 rounded-xl mb-6">
      <button 
        onClick={handlePrevMonth}
        className="p-2 hover:bg-bg-input rounded-lg transition-colors text-text-secondary hover:text-text-primary"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <select 
          value={month}
          onChange={(e) => handleDateChange(parseInt(e.target.value), year)}
          className="bg-transparent border-none text-text-primary font-medium focus:ring-0 cursor-pointer text-center appearance-none px-2"
        >
          {monthNames.map((name, i) => (
            <option key={i + 1} value={i + 1} className="bg-bg-card text-text-primary">
              {name}
            </option>
          ))}
        </select>
        
        <select 
          value={year}
          onChange={(e) => handleDateChange(month, parseInt(e.target.value))}
          className="bg-transparent border-none text-text-primary font-medium focus:ring-0 cursor-pointer text-center appearance-none px-2"
        >
          {Array.from({ length: 5 }).map((_, i) => {
            const currentYear = new Date().getFullYear();
            const y = currentYear - 2 + i; // +/- 2 years from current
            return (
              <option key={y} value={y} className="bg-bg-card text-text-primary">
                {y}
              </option>
            );
          })}
        </select>
      </div>

      <button 
        onClick={handleNextMonth}
        className="p-2 hover:bg-bg-input rounded-lg transition-colors text-text-secondary hover:text-text-primary"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
