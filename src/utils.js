export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const getTodayKey = () => dateKey(new Date());

export const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
export const MONTHS_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
export const DAYS_SHORT = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

export function formatDeadline(dk) {
  if (!dk) return '—';
  const tk = getTodayKey();
  if (dk === tk) return 'Vandaag';
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (dk === dateKey(tom)) return 'Morgen';
  const yes = new Date(); yes.setDate(yes.getDate() - 1);
  if (dk === dateKey(yes)) return 'Gisteren';
  const d = new Date(dk + 'T12:00:00');
  return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

export function getWeekDates(base) {
  const d = new Date(base);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

export const PRIO_COLOR = { '': '#9ca3af', hoog: '#DC2626', midden: '#E6B400', laag: '#2563EB' };
export const PRIO_BG    = { '': '#f3f4f6', hoog: '#FEE2E2', midden: '#FFF176', laag: '#DBEAFE' };
export const STATUS_COLOR = { '': '#9ca3af', open: '#2563EB', bezig: '#E6B400', klaar: '#16a34a' };
export const STATUS_BG    = { '': '#f3f4f6', open: '#DBEAFE', bezig: '#FFF176', klaar: '#dcfce7' };
