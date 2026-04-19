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
  const showingCustom = showCustomDates && timeRange.isCustom;
  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
        <TimeRangeSelector
          selectedRange={timeRange.selectedRange}
          onRangeChange={timeRange.setSelectedRange}
          showDeploymentAllTime={Boolean(timeRange.deploymentFilter)}
        />
        <div className="hidden sm:block">
          <DeviceDeploymentFilter
            deviceFilter={timeRange.deviceFilter}
            deploymentFilter={timeRange.deploymentFilter}
            deployments={deployments}
            onDeviceChange={timeRange.setDeviceFilter}
            onDeploymentChange={timeRange.setDeploymentFilter}
          />
        </div>
        {children}
      </div>
      {showingCustom && (
        <div className="mt-3 sm:mt-4">
          <CustomDateRange
            start={timeRange.customStart}
            end={timeRange.customEnd}
            onStartChange={timeRange.setCustomStart}
            onEndChange={timeRange.setCustomEnd}
            isValid={timeRange.isCustomValid}
          />
        </div>
      )}
    </div>
  );
}
