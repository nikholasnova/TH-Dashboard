import { useDevices } from '@/contexts/DevicesContext';
import { DeploymentWithCount } from '@/lib/supabase';

interface DeviceDeploymentFilterProps {
  deviceFilter: string;
  deploymentFilter: string;
  deployments: DeploymentWithCount[];
  onDeviceChange: (value: string) => void;
  onDeploymentChange: (value: string) => void;
}

export function DeviceDeploymentFilter({
  deviceFilter,
  deploymentFilter,
  deployments,
  onDeviceChange,
  onDeploymentChange,
}: DeviceDeploymentFilterProps) {
  const { devices } = useDevices();
  const filteredDeployments = deviceFilter
    ? deployments.filter((d) => d.device_id === deviceFilter)
    : deployments;

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
      <select
        value={deviceFilter}
        onChange={(e) => onDeviceChange(e.target.value)}
        className="h-14 bg-transparent border border-[var(--hairline-strong)] rounded-md px-4 text-sm text-[var(--fg)] w-full sm:w-44 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <option value="">All devices</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </select>
      <select
        value={deploymentFilter}
        onChange={(e) => onDeploymentChange(e.target.value)}
        className="h-14 bg-transparent border border-[var(--hairline-strong)] rounded-md px-4 text-sm text-[var(--fg)] w-full sm:w-64 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <option value="">All deployments</option>
        {filteredDeployments.map((dep) => (
          <option key={dep.id} value={dep.id.toString()}>
            {dep.name} ({dep.device_id})
          </option>
        ))}
      </select>
    </div>
  );
}
