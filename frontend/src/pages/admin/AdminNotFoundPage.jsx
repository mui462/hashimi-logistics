import { SearchX } from 'lucide-react';
import AdminPage from '../../components/admin/AdminPage';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { PATHS } from '../../config/paths';

export default function AdminNotFoundPage() {
  return (
    <AdminPage title="Page not found">
      <EmptyState icon={SearchX} title="That page doesn’t exist in the admin panel" description="Check the address, or go back to the dashboard." action={<Button to={PATHS.admin}>Go to dashboard</Button>} />
    </AdminPage>
  );
}
