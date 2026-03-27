import { useState, useEffect } from 'react';
import { api } from '../../api';

interface SitePage {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function About() {
  const [page, setPage] = useState<SitePage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SitePage>('/api/pages/about')
      .then(setPage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="-mx-4 -mt-6 px-4 py-12 section-slab">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex justify-center mb-3">
            <div className="china-crest" />
          </div>
          <h1 className="text-4xl font-bold text-ink mb-3">{page?.title || 'About Our Co-op'}</h1>
          <div className="accent-rule mx-auto mb-4" />
          <p className="text-ink/70 text-lg">Where every family plays a part in every child's growth.</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {loading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : page?.content ? (
          <div
            className="site-prose"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        ) : (
          <div className="text-center text-gray-500">Content is being updated.</div>
        )}
      </div>
    </div>
  );
}
