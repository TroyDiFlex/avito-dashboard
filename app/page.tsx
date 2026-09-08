import Dashboard from '@/components/dashboard';
import DashboardBoundary from '@/components/dashboard-boundary';
export default function Page() {
  return (
    <DashboardBoundary>
      <Dashboard />
    </DashboardBoundary>
  );
}
