import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface FeatureFlags {
  blog: boolean;
  resources: boolean;
  lesson_plans: boolean;
  member_directory: boolean;
  student_progress: boolean;
  families: boolean;
  my_children: boolean;
  my_rsvps: boolean;
  class_groups: boolean;
  notifications: boolean;
  messaging: boolean;
  documents: boolean;
  standards: boolean;
  payments: boolean;
}

const featureLabels: Record<string, { label: string; description: string }> = {
  blog: { label: 'Blog', description: 'Public blog with posts, drafts, and comments' },
  resources: { label: 'Resources', description: 'Shared resources page for members' },
  lesson_plans: { label: 'Lesson Plans', description: 'Teacher lesson plan library with collaboration' },
  member_directory: { label: 'Member Directory', description: 'Directory showing all members, contact info, and hosting history' },
  student_progress: { label: 'Student Progress', description: 'Milestone tracking and progress reports for students' },
  families: { label: 'Families', description: 'Family groups that share children and RSVPs between parents' },
  my_children: { label: 'My Children', description: 'Parents can manage their children profiles, allergies, and emergency contacts' },
  my_rsvps: { label: 'My RSVPs', description: 'Parents can view all their session RSVPs in one place' },
  class_groups: { label: 'Class Groups', description: 'Organize students into named groups with grading and assignments' },
  notifications: { label: 'Notifications', description: 'In-app notification center for activity alerts' },
  messaging: { label: 'Messaging', description: 'Parent-teacher messaging with conversation threads' },
  documents: { label: 'Documents', description: 'Document and waiver management with approval workflow' },
  standards: { label: 'Standards', description: 'Curriculum standards tracking mapped to assignments' },
  payments: { label: 'Payments', description: 'Payment tracking ledger for session costs' },
};

export default function ManageFeatures() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<FeatureFlags>('/api/features').then(setFlags).catch(() => {});
  }, []);

  const toggle = async (key: keyof FeatureFlags) => {
    if (!flags) return;
    setSaving(true);
    const newValue = !flags[key];
    try {
      await api.put('/api/admin/features', { [key]: newValue });
      setFlags({ ...flags, [key]: newValue });
    } catch {
      // revert on error
    } finally {
      setSaving(false);
    }
  };

  if (!flags) return <div className="text-center py-16 text-ink/40">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link to="/admin" className="text-sm text-emerald-700 hover:text-emerald-800 font-medium mb-4 inline-block">&larr; Admin Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold text-ink">Feature Settings</h1>
        <p className="text-ink/60 text-sm mt-1">Enable or disable major site features. Disabled features hide from navigation.</p>
      </div>

      <div className="space-y-3">
        {Object.entries(featureLabels).map(([key, { label, description }]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{label}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            </div>
            <button
              onClick={() => toggle(key as keyof FeatureFlags)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                flags[key as keyof FeatureFlags] ? 'bg-emerald-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  flags[key as keyof FeatureFlags] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Changes take effect immediately. Disabled features are hidden from navigation but existing data is preserved.
      </p>
    </div>
  );
}
