import { Navigate } from 'react-router';

export default function CruushPlusUpgrade() {
  return <Navigate to="/store?surface=settings&benefit=overview" replace />;
}
