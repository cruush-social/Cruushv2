import { Navigate, useParams } from 'react-router';

export default function GroupDetail() {
  const { groupId } = useParams();

  return <Navigate to={groupId ? `/chat/group/${groupId}` : '/messages'} replace />;
}
