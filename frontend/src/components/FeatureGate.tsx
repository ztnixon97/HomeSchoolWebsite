import { Link } from 'react-router-dom';
import { useFeatures, type FeatureFlags } from '../features';
import { useAuth } from '../auth';

interface Props {
  children: React.ReactNode;
  feature: keyof FeatureFlags;
}

export default function FeatureGate({ children, feature }: Props) {
  const features = useFeatures();
  const { user } = useAuth();

  if (!features[feature]) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-ink">Feature Unavailable</h1>
        <p className="text-ink/60 text-sm">This feature is not currently enabled.</p>
        <Link
          to={user ? '/dashboard' : '/'}
          className="inline-block btn-primary text-sm no-underline"
        >
          {user ? 'Back to Dashboard' : 'Back to Home'}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
