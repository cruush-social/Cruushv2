import { Navigate, useSearchParams } from 'react-router';

export default function CruushPlusSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('sessionId') ?? params.get('session_id');
  return <Navigate to={sessionId ? `/rewards?checkoutSession=${encodeURIComponent(sessionId)}` : '/rewards'} replace />;
}
