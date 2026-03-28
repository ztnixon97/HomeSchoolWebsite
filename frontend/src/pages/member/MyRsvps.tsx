import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Pagination from '../../components/Pagination';

interface RsvpEntry {
  id: number;
  session_id: number;
  student_id: number;
  student_name: string;
  status: string;
  note: string | null;
  session_title: string;
  session_date: string;
  start_time: string | null;
}

export default function MyRsvps() {
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);

  const refresh = () => {
    api.get<RsvpEntry[]>('/api/my-rsvps').then(setRsvps).catch(() => {});
  };

  useEffect(refresh, []);

  const handleCancel = async (id: number) => {
    if (!window.confirm('Cancel this RSVP?')) return;
    await api.del(`/api/rsvps/${id}`);
    refresh();
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = rsvps.filter(r => r.session_date >= today);
  const past = rsvps.filter(r => r.session_date < today);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-ink">My RSVPs</h1>
        <p className="text-sm text-ink/60 mt-1">All session RSVPs for your children.</p>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="panel-quiet p-6 text-sm text-ink/60">
          No RSVPs yet. <Link to="/sessions" className="text-cobalt font-medium">Browse sessions</Link> to RSVP your children.
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map(r => (
              <div key={r.id} className="panel p-4 flex items-center justify-between">
                <div>
                  <Link to={`/sessions/${r.session_id}`} className="font-medium text-ink hover:text-cobalt">
                    {r.session_title}
                  </Link>
                  <div className="text-sm text-ink/60 mt-0.5">
                    {new Date(r.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {r.start_time && ` at ${r.start_time}`}
                    {' \u2014 '}
                    <span className="font-medium">{r.student_name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status}
                  </span>
                  <button onClick={() => handleCancel(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink/60 mb-3">Past</h2>
          <Pagination items={past} pageSize={10}>
            {(pageItems) => (
              <div className="space-y-2">
                {pageItems.map(r => (
                  <div key={r.id} className="panel-quiet p-4 flex items-center justify-between opacity-70">
                    <div>
                      <Link to={`/sessions/${r.session_id}`} className="font-medium text-ink/70 hover:text-ink">
                        {r.session_title}
                      </Link>
                      <div className="text-sm text-ink/50 mt-0.5">
                        {new Date(r.session_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' \u2014 '}{r.student_name}
                      </div>
                    </div>
                    <span className="text-xs text-ink/40">{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Pagination>
        </div>
      )}
    </div>
  );
}
