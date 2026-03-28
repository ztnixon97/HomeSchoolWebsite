import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface SessionType {
  id: number;
  name: string;
  label: string;
  sort_order: number;
  active: boolean;
  hostable: boolean;
  rsvpable: boolean;
  multi_day: boolean;
  description?: string | null;
  requires_location: boolean;
  supports_cost: boolean;
  cost_label?: string | null;
  allow_supplies: boolean;
  allow_attendance: boolean;
  allow_photos: boolean;
}

export default function ManageSessionTypes() {
  const [types, setTypes] = useState<SessionType[]>([]);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [description, setDescription] = useState('');
  const [hostable, setHostable] = useState(true);
  const [rsvpable, setRsvpable] = useState(true);
  const [multiDay, setMultiDay] = useState(false);
  const [requiresLocation, setRequiresLocation] = useState(false);
  const [supportsCost, setSupportsCost] = useState(false);
  const [costLabel, setCostLabel] = useState('');
  const [allowSupplies, setAllowSupplies] = useState(true);
  const [allowAttendance, setAllowAttendance] = useState(true);
  const [allowPhotos, setAllowPhotos] = useState(true);

  const refresh = () => {
    api.get<SessionType[]>('/api/admin/session-types').then(setTypes).catch(() => {});
  };

  useEffect(refresh, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/admin/session-types', {
      name,
      label,
      sort_order: sortOrder ? parseInt(sortOrder) : 0,
      active: true,
      hostable,
      rsvpable,
      multi_day: multiDay,
      description: description || null,
      requires_location: requiresLocation,
      supports_cost: supportsCost,
      cost_label: costLabel || null,
      allow_supplies: allowSupplies,
      allow_attendance: allowAttendance,
      allow_photos: allowPhotos,
    });
    setName('');
    setLabel('');
    setSortOrder('');
    setDescription('');
    setHostable(true);
    setRsvpable(true);
    setMultiDay(false);
    setRequiresLocation(false);
    setSupportsCost(false);
    setCostLabel('');
    setAllowSupplies(true);
    setAllowAttendance(true);
    setAllowPhotos(true);
    refresh();
  };

  const toggle = async (t: SessionType) => {
    await api.put(`/api/admin/session-types/${t.id}`, { active: !t.active });
    refresh();
  };

  const toggleFlag = async (t: SessionType, field: string, value: boolean) => {
    await api.put(`/api/admin/session-types/${t.id}`, { [field]: value });
    refresh();
  };

  return (
    <div className="space-y-6">
      <Link to="/admin" className="text-sm text-[#1e3a5f] hover:underline mb-4 inline-block">
        ← Admin Dashboard
      </Link>

      <h1 className="text-3xl font-bold">Session Types</h1>

      <form onSubmit={create} className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
        <h2 className="text-lg font-semibold">Add Type</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name (id)</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="field_trip" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="Field Trip" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sort Order</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="Optional summary shown to parents" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hostable} onChange={e => setHostable(e.target.checked)} />
            Hostable
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rsvpable} onChange={e => setRsvpable(e.target.checked)} />
            RSVP enabled
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)} />
            Multi-day
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={requiresLocation} onChange={e => setRequiresLocation(e.target.checked)} />
            Requires location
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={supportsCost} onChange={e => setSupportsCost(e.target.checked)} />
            Supports cost
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowSupplies} onChange={e => setAllowSupplies(e.target.checked)} />
            Supply sign-ups
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowAttendance} onChange={e => setAllowAttendance(e.target.checked)} />
            Attendance tracking
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowPhotos} onChange={e => setAllowPhotos(e.target.checked)} />
            Photo sharing
          </label>
        </div>
        {supportsCost && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cost Label</label>
            <input value={costLabel} onChange={e => setCostLabel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder="Estimated cost" />
          </div>
        )}
        <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded text-sm hover:bg-gray-800">Create</button>
      </form>

      <div className="space-y-2">
        {types.map(t => (
          <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{t.label}</div>
              <div className="text-xs text-gray-500">{t.name} · order {t.sort_order}</div>
              {t.description && <div className="text-xs text-gray-400 mt-1">{t.description}</div>}
              <div className="text-xs text-gray-400 mt-1">
                {t.hostable ? 'Hostable' : 'Not hostable'} · {t.rsvpable ? 'RSVP' : 'No RSVP'} · {t.multi_day ? 'Multi-day' : 'Single-day'}
                {t.allow_supplies ? ' · Supplies' : ''}{t.allow_attendance ? ' · Attendance' : ''}{t.allow_photos ? ' · Photos' : ''}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button onClick={() => toggleFlag(t, 'hostable', !t.hostable)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.hostable ? 'Disable hosting' : 'Enable hosting'}
                </button>
                <button onClick={() => toggleFlag(t, 'rsvpable', !t.rsvpable)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.rsvpable ? 'Disable RSVP' : 'Enable RSVP'}
                </button>
                <button onClick={() => toggleFlag(t, 'multi_day', !t.multi_day)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.multi_day ? 'Set single-day' : 'Set multi-day'}
                </button>
                <button onClick={() => toggleFlag(t, 'requires_location', !t.requires_location)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.requires_location ? 'Location optional' : 'Require location'}
                </button>
                <button onClick={() => toggleFlag(t, 'supports_cost', !t.supports_cost)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.supports_cost ? 'No cost field' : 'Add cost field'}
                </button>
                <button onClick={() => toggleFlag(t, 'allow_supplies', !t.allow_supplies)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.allow_supplies ? 'Disable supplies' : 'Enable supplies'}
                </button>
                <button onClick={() => toggleFlag(t, 'allow_attendance', !t.allow_attendance)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.allow_attendance ? 'Disable attendance' : 'Enable attendance'}
                </button>
                <button onClick={() => toggleFlag(t, 'allow_photos', !t.allow_photos)} className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">
                  {t.allow_photos ? 'Disable photos' : 'Enable photos'}
                </button>
              </div>
            </div>
            <button onClick={() => toggle(t)} className="text-xs text-blue-600 hover:text-blue-800">
              {t.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
