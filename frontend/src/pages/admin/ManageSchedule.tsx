import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Event {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: string;
}

const typeColors: Record<string, string> = {
  class: 'bg-emerald-100 text-emerald-800',
  field_trip: 'bg-blue-100 text-blue-800',
  holiday: 'bg-amber-100 text-amber-800',
  meeting: 'bg-purple-100 text-purple-800',
};

export default function ManageSchedule() {
  const [events, setEvents] = useState<Event[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState('class');
  const [description, setDescription] = useState('');

  const refresh = () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    api.get<Event[]>(`/api/events?month=${month}`).then(setEvents).catch(() => {});
  };

  useEffect(refresh, []);

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/admin/events', {
      title,
      description: description || null,
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      event_type: eventType,
    });
    setTitle('');
    setDescription('');
    setEventDate('');
    setStartTime('');
    setEndTime('');
    setShowForm(false);
    refresh();
  };

  const deleteEvent = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    await api.del(`/api/admin/events/${id}`);
    refresh();
  };

  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium inline-block mb-4">&larr; Admin Dashboard</Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Manage Schedule</h1>
          <p className="text-ink/60 text-sm mt-1">Add events, classes, and important dates.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addEvent} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value)} className={inputClass}>
                <option value="class">Class</option>
                <option value="field_trip">Field Trip</option>
                <option value="holiday">Holiday</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputClass} />
          </div>
          <button type="submit" className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
            Create Event
          </button>
        </form>
      )}

      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ink/40">No events this month.</p>
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-gray-900">{ev.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${typeColors[ev.event_type] || 'bg-gray-100 text-gray-700'}`}>
                    {ev.event_type.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(ev.event_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {ev.start_time && ` at ${ev.start_time}`}
                  {ev.end_time && ` - ${ev.end_time}`}
                </div>
              </div>
              <button onClick={() => deleteEvent(ev.id)} className="text-xs text-red-500 hover:text-red-700 font-medium py-2 px-3 rounded-lg">
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
