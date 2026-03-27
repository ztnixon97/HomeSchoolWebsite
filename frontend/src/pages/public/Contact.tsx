import { useState, useEffect } from 'react';
import { api } from '../../api';

interface SitePage {
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

const EMAIL = 'westernloudouncoop@gmail.com';

export default function Contact() {
  const [page, setPage] = useState<SitePage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SitePage>('/api/pages/contact')
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
          <h1 className="text-4xl font-bold text-ink mb-3">{page?.title || 'Get in Touch'}</h1>
          <div className="accent-rule mx-auto mb-4" />
          <p className="text-ink/70 text-lg">We'd love to hear from you and share more about our co-op.</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto space-y-6 px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 gap-6">
          {/* Email */}
          <div className="panel-quiet p-6">
            <h2 className="text-lg font-semibold text-ink mb-2">Email</h2>
            <a
              href={`mailto:${EMAIL}`}
              className="text-cobalt hover:text-cobalt-dark text-sm font-medium no-underline"
            >
              {EMAIL}
            </a>
            <p className="text-ink/50 text-xs mt-2">We typically respond within 24 hours.</p>
          </div>

          {/* Location */}
          <div className="panel-quiet p-6">
            <h2 className="text-lg font-semibold text-ink mb-2">Location</h2>
            <p className="text-ink/70 text-sm">Classes are hosted at member homes on a rotating basis.</p>
            <p className="text-ink/50 text-xs mt-2">Addresses shared with enrolled families.</p>
          </div>
        </div>

        {/* CTA */}
        <div className="panel p-8 text-center">
          <h2 className="text-xl font-semibold text-ink mb-3">Interested in Joining?</h2>
          <p className="text-ink/70 mb-4 max-w-md mx-auto">
            We'd love to welcome new families to our co-op. Reach out via email to learn more about
            our program, schedule a visit, and see if we're the right fit for your family.
          </p>
          <a
            href={`mailto:${EMAIL}?subject=Interested in joining the co-op`}
            className="inline-block btn-primary no-underline"
          >
            Send Us an Email
          </a>
        </div>

        {/* Additional Content */}
        {!loading && page?.content && (
          <div
            className="site-prose mt-8 pt-8 border-t border-gray-200"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        )}
      </div>
    </div>
  );
}
