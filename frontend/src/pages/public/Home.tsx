import { Link } from 'react-router-dom';
import { useFeatures } from '../../features';

export default function Home() {
  const features = useFeatures();
  return (
    <div className="space-y-16">
      <section className="-mx-4 -mt-6 px-4 py-12 md:py-20 china-pattern">
        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/60 mb-4">Western Loudoun, Virginia</p>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight mb-6">
              <span className="block">Western Loudoun</span>
              <span className="block">Preschool Co-op</span>
            </h1>
            <div className="accent-rule mb-5" />
            <p className="text-base md:text-lg text-ink/70 max-w-xl">
              A parent-led cooperative for early learners. Families host, teach, and build a shared rhythm of discovery and care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/schedule"
                className="no-underline btn-primary"
              >
                View Schedule
              </Link>
              <Link
                to="/about"
                className="no-underline btn-ghost"
              >
                About WLPC
              </Link>
            </div>
          </div>
          <div
            className="h-72 md:h-96 rounded-2xl overflow-hidden border border-ink/10 panel"
            style={{
              backgroundImage: "url('/catoctin-creek.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        </div>
        <div className="mt-10 flex items-center gap-3 text-xs text-ink/60">
          <div className="china-crest" />
          <div>Small co-op, deep roots across Western Loudoun.</div>
        </div>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div className="panel-quiet p-6">
          <h2 className="text-lg font-semibold mb-3">Weekly Sessions</h2>
          <p className="text-sm text-ink/70">
            Families claim sessions, coordinate supplies, and host play-based lessons together.
          </p>
          <Link to="/schedule" className="inline-block mt-4 text-sm text-ink hover:text-ink/70 no-underline">
            Explore the calendar
          </Link>
        </div>
        {features.lesson_plans && (
          <div className="panel-quiet p-6">
            <h2 className="text-lg font-semibold mb-3">Shared Curriculum</h2>
            <p className="text-sm text-ink/70">
              Lesson plans stay editable and collaborative so the co-op grows with the children.
            </p>
            <Link to="/lesson-plans" className="inline-block mt-4 text-sm text-ink hover:text-ink/70 no-underline">
              Browse lesson plans
            </Link>
          </div>
        )}
        {features.blog && (
          <div className="panel-quiet p-6">
            <h2 className="text-lg font-semibold mb-3">Community Notes</h2>
            <p className="text-sm text-ink/70">
              The blog captures recaps, updates, and the everyday wins of our co-op.
            </p>
            <Link to="/blog" className="inline-block mt-4 text-sm text-ink hover:text-ink/70 no-underline">
              Read the journal
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
        <div className="panel-quiet p-6">
          <h2 className="text-2xl font-semibold mb-4">How it works</h2>
          <div className="space-y-4 text-sm text-ink/70">
            <div>
              <div className="font-semibold text-ink">Join the co-op</div>
              <div>Parents register their family, add children, and receive hosting guidelines.</div>
            </div>
            <div>
              <div className="font-semibold text-ink">Claim a session</div>
              <div>Select a date, set the RSVP cutoff, and choose a lesson plan.</div>
            </div>
            <div>
              <div className="font-semibold text-ink">Teach together</div>
              <div>Families RSVP, dietary needs are summarized, and hosts run the day.</div>
            </div>
          </div>
        </div>
        <div className="panel p-8">
          <h3 className="text-xl font-semibold mb-3">Rooted in Western Loudoun</h3>
          <p className="text-sm text-ink/70 leading-relaxed">
            We gather in homes and community spaces across Western Loudoun, Virginia. The co-op keeps families connected,
            and the schedule makes it easy to coordinate hosting, field trips, and holiday breaks.
          </p>
          <Link to="/contact" className="inline-block mt-5 text-sm text-ink hover:text-ink/70 no-underline">
            Reach out to the co-op
          </Link>
        </div>
      </section>
    </div>
  );
}
