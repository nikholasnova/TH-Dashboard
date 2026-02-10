import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { CustomDateRange } from '@/components/CustomDateRange';
import { DeviceDeploymentFilter } from '@/components/DeviceDeploymentFilter';
import { DeploymentWithCount } from '@/lib/supabase';
import type { UseTimeRangeReturn } from '@/hooks/useTimeRange';

interface FilterToolbarProps {
  timeRange: UseTimeRangeReturn;
  deployments: DeploymentWithCount[];
  showCustomDates?: boolean;
  children?: React.ReactNode;
}

export function FilterToolbar({
  timeRange,
  deployments,
  showCustomDates = true,
  children,
}: FilterToolbarProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-8">
      <TimeRangeSelector
        selectedRange={timeRange.selectedRange}
        onRangeChange={timeRange.setSelectedRange}
      />
      {showCustomDates && timeRange.isCustom && !timeRange.deploymentFilter && (
        <CustomDateRange
          start={timeRange.customStart}
          end={timeRange.customEnd}
          onStartChange={timeRange.setCustomStart}
          onEndChange={timeRange.setCustomEnd}
          isValid={timeRange.isCustomValid}
        />
      )}
      <DeviceDeploymentFilter
        deviceFilter={timeRange.deviceFilter}
        deploymentFilter={timeRange.deploymentFilter}
        deployments={deployments}
        onDeviceChange={timeRange.setDeviceFilter}
        onDeploymentChange={timeRange.setDeploymentFilter}
      />
      {children}
    </div>
  );
}

