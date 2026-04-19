import { useDevices } from '@/contexts/DevicesContext';
import { DeploymentWithCount } from '@/lib/supabase';

interface DeviceDeploymentFilterProps {
  deviceFilter: string;
  deploymentFilter: string;
  deployments: DeploymentWithCount[];
  onDeviceChange: (value: string) => void;
  onDeploymentChange: (value: string) => void;
}

interface InlineSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children: React.ReactNode;
  className?: string;
}

export function InlineSelect({ value, onChange, placeholder, children, className = '' }: InlineSelectProps) {
  const hasValue = value !== '';
  return (
    <div className={`relative inline-flex items-stretch border-b border-[var(--hairline)] ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none bg-transparent h-14 pl-0 pr-7 text-sm tracking-tight cursor-pointer focus:outline-none w-full transition-colors ${
          hasValue ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
        }`}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
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
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-stretch gap-2 sm:gap-6">
      <InlineSelect
        value={deviceFilter}
        onChange={onDeviceChange}
        placeholder="All devices"
        className="w-full sm:w-40"
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </InlineSelect>
      <InlineSelect
        value={deploymentFilter}
        onChange={onDeploymentChange}
        placeholder="All deployments"
        className="w-full sm:w-56"
      >
        {filteredDeployments.map((dep) => (
          <option key={dep.id} value={dep.id.toString()}>
            {dep.name} ({dep.device_id})
          </option>
        ))}
      </InlineSelect>
    </div>
  );
}
