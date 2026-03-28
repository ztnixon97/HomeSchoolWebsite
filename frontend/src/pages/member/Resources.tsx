import { useEffect, useState } from 'react';
import { api } from '../../api';
import RichTextDisplay from '../../components/RichTextDisplay';

interface Resource {
  id: number;
  title: string;
  content: string;
  category: string;
}

const formatCategory = (value: string) => value.replace(/_/g, ' ');

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);

  useEffect(() => {
    api.get<Resource[]>('/api/resources').then(setResources).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <section className="-mx-4 -mt-6 px-4 py-12 section-slab">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <h1 className="text-4xl font-bold text-ink mb-3">Resources</h1>
          <div className="accent-rule mx-auto mb-4" />
          <p className="text-ink/70 text-lg">Handbooks, supply lists, and helpful info for co-op families.</p>
        </div>
      </section>

      {resources.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink/40">No resources available yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            {resources.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                  selected?.id === r.id
                    ? 'border-ink/30 bg-ink/5'
                    : 'border-ink/10 bg-white hover:border-ink/30 hover:bg-ink/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div>
                    <div className={`font-medium ${selected?.id === r.id ? 'text-ink' : 'text-ink'}`}>{r.title}</div>
                    <div className="text-xs text-ink/50 capitalize">{formatCategory(r.category)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="md:col-span-2">
            {selected ? (
              <div className="bg-white rounded-xl border border-ink/10 p-6">
                <h2 className="text-xl font-semibold text-ink mb-4">{selected.title}</h2>
                <RichTextDisplay content={selected.content} />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-ink/10 p-8 text-center">
                <p className="text-ink/50">Select a resource to view its content.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
