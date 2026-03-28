interface Session {
  id: number;
  title: string;
  session_date: string;
  end_date?: string | null;
  start_time: string | null;
  session_type_name: string | null;
  session_type_label: string | null;
  status: string;
}

interface Props {
  year: number;
  month: number; // 1-12
  sessions: Session[];
  linkTo?: (sessionId: number) => string;
}

const typeColors: Record<string, string> = {
  class: 'border-blue-300',
  field_trip: 'border-green-300',
  holiday: 'border-yellow-300',
  meeting: 'border-purple-300',
};
const statusColors: Record<string, string> = {
  open: 'bg-red-100 text-red-800',
  claimed: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-700',
};

export default function Calendar({ year, month, sessions, linkTo }: Props) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const eventsByDay = new Map<number, Session[]>();
  for (const ev of sessions) {
    const start = new Date(ev.session_date + 'T00:00:00');
    const end = ev.end_date ? new Date(ev.end_date + 'T00:00:00') : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getFullYear() === year && cursor.getMonth() + 1 === month) {
        const day = cursor.getDate();
        if (!eventsByDay.has(day)) eventsByDay.set(day, []);
        eventsByDay.get(day)!.push(ev);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
      <div className="min-w-[500px] grid grid-cols-7 text-center text-xs font-medium text-gray-500 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="min-w-[500px] grid grid-cols-7">
        {days.map((day, i) => (
          <div
            key={i}
            className={`min-h-[80px] border-b border-r border-gray-100 p-1 ${
              day === null ? 'bg-gray-50' : ''
            } ${isToday(day!) ? 'bg-blue-50' : ''}`}
          >
            {day !== null && (
              <>
                <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-blue-600' : 'text-gray-500'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {(eventsByDay.get(day) || []).map(ev => {
                    const content = (
                      <div
                        className={`text-xs px-1 py-0.5 rounded truncate border-l-2 ${
                          statusColors[ev.status] || 'bg-gray-100 text-gray-700'
                        } ${typeColors[ev.session_type_name || ''] || 'border-gray-200'}`}
                        title={`${ev.title}${ev.start_time ? ` at ${ev.start_time}` : ''} · ${ev.status}`}
                      >
                        {ev.start_time && <span className="font-medium">{ev.start_time} </span>}
                        {ev.title}
                      </div>
                    );
                    if (linkTo) {
                      return (
                        <a key={ev.id} href={linkTo(ev.id)} className="block no-underline hover:opacity-90">
                          {content}
                        </a>
                      );
                    }
                    return <div key={ev.id}>{content}</div>;
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
