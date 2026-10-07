import { Navigate } from 'react-router';

export default function CruushPlusCheckout() {
  return <Navigate to="/store?surface=settings&benefit=overview" replace />;
}
