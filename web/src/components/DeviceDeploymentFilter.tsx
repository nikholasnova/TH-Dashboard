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
    <div className="glass-card p-3 flex flex-wrap items-center gap-4">
      <span className="text-xs text-[#a0aec0] font-medium">Filters:</span>
      <select
        value={deviceFilter}
        onChange={(e) => onDeviceChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]"
      >
        <option value="">All Devices</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </select>
      <select
        value={deploymentFilter}
        onChange={(e) => onDeploymentChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[180px]"
      >
        <option value="">All Deployments</option>
        {filteredDeployments.map((dep) => (
          <option key={dep.id} value={dep.id.toString()}>
            {dep.name} ({dep.device_id})
          </option>
        ))}
      </select>
    </div>
  );
}

