import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import RichTextEditor from '../../components/RichTextEditor';
import { FilePreviewGrid } from '../../components/FilePreview';

interface LessonPlan {
  id: number;
  title: string;
  description: string;
  age_group: string | null;
  category: string | null;
}

interface FileRecord {
  id: number;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

interface User {
  id: number;
  display_name: string;
  email: string;
  role: string;
}

interface Collaborator {
  user_id: number;
  display_name: string;
  email: string;
}

export default function EditLessonPlan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [category, setCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<FileRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<LessonPlan>(`/api/lesson-plans/${id}`).then(p => {
      setTitle(p.title);
      setDescription(p.description);
      setAgeGroup(p.age_group || '');
      setCategory(p.category || '');
    }).catch(() => {});
    api.get<FileRecord[]>(`/api/files/lesson_plan/${id}`).then(setExistingFiles).catch(() => {});
    api.get<User[]>('/api/users').then(setUsers).catch(() => {});
    api.get<Collaborator[]>(`/api/lesson-plans/${id}/collaborators`).then(setCollaborators).catch(() => {});
  }, [id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api.put(`/api/lesson-plans/${id}`, {
        title,
        description,
        age_group: ageGroup || null,
        category: category || null,
      });
      for (const file of files) {
        await api.upload(file, 'lesson_plan', Number(id));
      }
      navigate(`/lesson-plans/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update lesson plan');
    } finally {
      setSaving(false);
    }
  };

  const addCollaborator = async () => {
    if (!id || !addUserId) return;
    await api.post(`/api/lesson-plans/${id}/collaborators`, { user_id: parseInt(addUserId) });
    setAddUserId('');
    const collabs = await api.get<Collaborator[]>(`/api/lesson-plans/${id}/collaborators`);
    setCollaborators(collabs);
  };

  const removeCollaborator = async (userId: number) => {
    if (!id) return;
    await api.del(`/api/lesson-plans/${id}/collaborators/${userId}`);
    const collabs = await api.get<Collaborator[]>(`/api/lesson-plans/${id}/collaborators`);
    setCollaborators(collabs);
  };

  const availableUsers = users.filter(u => !collaborators.some(c => c.user_id === u.id));
  const inputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors";

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Edit Lesson Plan</h1>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-5">
        {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 p-3 rounded-lg">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Age Group</label>
            <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              <option value="2-3">2-3 years</option>
              <option value="3-4">3-4 years</option>
              <option value="4-5">4-5 years</option>
              <option value="mixed">Mixed ages</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              <option value="art">Art</option>
              <option value="science">Science</option>
              <option value="literacy">Literacy</option>
              <option value="math">Math</option>
              <option value="social">Social Skills</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description / Plan</label>
          <RichTextEditor content={description} onChange={setDescription} placeholder="Describe the lesson plan, materials needed, steps, etc." />
        </div>

        {existingFiles.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Existing Attachments</label>
            <FilePreviewGrid files={existingFiles} />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Add Attachments</label>
          <input
            type="file"
            multiple
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          {files.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">{files.length} file(s) selected</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </form>

      {/* Collaborators */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Collaborators</h2>
        {collaborators.length === 0 ? (
          <p className="text-sm text-gray-500">No collaborators yet.</p>
        ) : (
          <div className="space-y-2">
            {collaborators.map(c => (
              <div key={c.user_id} className="flex items-center justify-between text-sm bg-gray-50 px-4 py-2.5 rounded-lg">
                <div>
                  <span className="font-medium text-gray-800">{c.display_name}</span>
                  <span className="text-gray-500 ml-2">({c.email})</span>
                </div>
                <button onClick={() => removeCollaborator(c.user_id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1.5">Add collaborator</label>
            <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className={inputClass}>
              <option value="">Select user...</option>
              {availableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>
              ))}
            </select>
          </div>
          <button
            onClick={addCollaborator}
            disabled={!addUserId}
            className="bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
