import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface SessionType {
  id: number;
  name: string;
  label: string;
}

interface GeneratedSession {
  date: string;
  skipped: boolean;
}

export default function BulkSessions() {
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('Friday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxStudents, setMaxStudents] = useState('10');
  const [skipDates, setSkipDates] = useState<string[]>(['']);
  const [rsvpCutoff, setRsvpCutoff] = useState('2 days before');
  const [generatedSessions, setGeneratedSessions] = useState<GeneratedSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState('');

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const rsvpOptions = ['1 day before', '2 days before', '3 days before', '1 week before'];

  useEffect(() => {
    const fetchSessionTypes = async () => {
      try {
        const types = await api.get<SessionType[]>('/api/session-types');
        setSessionTypes(types);
        if (types.length > 0) {
          setSelectedType(String(types[0].id));
        }
      } catch (error) {
        console.error('Failed to fetch session types:', error);
      }
    };

    fetchSessionTypes();
  }, []);

  const getDayOfWeekNumber = (day: string): number => {
    const days: { [key: string]: number } = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
    };
    return days[day] || 5;
  };

  const generateDates = () => {
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const skipSet = new Set(skipDates.filter(d => d)); // Filter out empty strings
    const targetDayNum = getDayOfWeekNumber(dayOfWeek);
    const generated: GeneratedSession[] = [];

    let current = new Date(start);
    while (current <= end) {
      // JavaScript getDay: 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
      // Convert: Monday=1 -> 1, ..., Friday=5 -> 5, Sunday=0 -> 0
      const jsDay = current.getDay();
      const convertedDay = jsDay === 0 ? 0 : jsDay;

      if (convertedDay === targetDayNum) {
        const dateStr = current.toISOString().split('T')[0];
        generated.push({
          date: dateStr,
          skipped: skipSet.has(dateStr),
        });
      }

      current.setDate(current.getDate() + 1);
    }

    setGeneratedSessions(generated);
  };

  const addSkipDate = () => {
    setSkipDates([...skipDates, '']);
  };

  const removeSkipDate = (index: number) => {
    setSkipDates(skipDates.filter((_, i) => i !== index));
  };

  const updateSkipDate = (index: number, value: string) => {
    const newDates = [...skipDates];
    newDates[index] = value;
    setSkipDates(newDates);
  };

  const createSessions = async () => {
    if (!selectedType || !title) {
      alert('Please fill in session type and title');
      return;
    }

    const sessionsToCreate = generatedSessions.filter(s => !s.skipped);
    if (sessionsToCreate.length === 0) {
      alert('No sessions to create');
      return;
    }

    setCreating(true);
    let successCount = 0;

    try {
      for (let i = 0; i < sessionsToCreate.length; i++) {
        const session = sessionsToCreate[i];
        setCreationProgress(`Creating session ${i + 1} of ${sessionsToCreate.length}...`);

        try {
          await api.post('/api/admin/sessions', {
            session_type_id: parseInt(selectedType),
            title,
            session_date: session.date,
            start_time: startTime,
            end_time: endTime,
            max_students: parseInt(maxStudents),
            rsvp_cutoff: rsvpCutoff,
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to create session for ${session.date}:`, err);
        }
      }

      alert(`Successfully created ${successCount} out of ${sessionsToCreate.length} sessions`);
      // Reset form
      setGeneratedSessions([]);
      setTitle('');
      setStartDate('');
      setEndDate('');
    } catch (error) {
      console.error('Error creating sessions:', error);
    } finally {
      setCreating(false);
      setCreationProgress('');
    }
  };

  const inputClass = "px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="space-y-8">
      <Link to="/admin" className="text-sm text-[#1e3a5f] hover:underline mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bulk Create Sessions</h1>
        <p className="text-gray-500 text-sm mt-1">Generate recurring weekly sessions in bulk.</p>
      </div>

      {/* Form Section */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Session Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Session Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Session Type *</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className={inputClass}
            >
              <option value="">Select session type...</option>
              {sessionTypes.map(type => (
                <option key={type.id} value={String(type.id)}>
                  {type.label || type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title Template *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Friday Co-op"
              className={inputClass}
            />
          </div>

          {/* Day of Week */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Day of Week</label>
            <select
              value={dayOfWeek}
              onChange={e => setDayOfWeek(e.target.value)}
              className={inputClass}
            >
              {daysOfWeek.map(day => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          {/* Max Students */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Students</label>
            <input
              type="number"
              value={maxStudents}
              onChange={e => setMaxStudents(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date *</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* RSVP Cutoff */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">RSVP Cutoff</label>
            <select
              value={rsvpCutoff}
              onChange={e => setRsvpCutoff(e.target.value)}
              className={inputClass}
            >
              {rsvpOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Skip Dates */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Skip Dates (Holidays, Breaks)</h3>
          <div className="space-y-2">
            {skipDates.map((date, index) => (
              <div key={index} className="flex gap-2 items-end">
                <input
                  type="date"
                  value={date}
                  onChange={e => updateSkipDate(index, e.target.value)}
                  className={inputClass}
                />
                {skipDates.length > 1 && (
                  <button
                    onClick={() => removeSkipDate(index)}
                    className="px-3 py-2.5 text-gray-500 hover:text-red-600 text-sm font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addSkipDate}
            className="mt-2 text-sm text-emerald-700 hover:text-emerald-800 font-medium"
          >
            + Add another date
          </button>
        </div>

        {/* Generate Button */}
        <div className="mt-6">
          <button
            onClick={generateDates}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Generate Dates
          </button>
        </div>
      </section>

      {/* Preview Section */}
      {generatedSessions.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Preview ({generatedSessions.filter(s => !s.skipped).length} sessions)
          </h2>

          <div className="max-h-64 overflow-y-auto mb-4">
            <div className="space-y-2">
              {generatedSessions.map((session, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border text-sm ${
                    session.skipped
                      ? 'bg-gray-50 border-gray-200 line-through text-gray-400'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  {new Date(session.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {session.skipped && ' (Skipped)'}
                </div>
              ))}
            </div>
          </div>

          {/* Create Button */}
          <button
            onClick={createSessions}
            disabled={creating}
            className="bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Sessions'}
          </button>

          {creationProgress && (
            <p className="text-sm text-gray-500 mt-3">{creationProgress}</p>
          )}
        </section>
      )}
    </div>
  );
}
