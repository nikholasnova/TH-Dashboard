export { supabase } from './client';
export { getServerClient } from './server';

export type {
  Reading,
  ChartSample,
  DeviceStats,
  Deployment,
  DeploymentWithCount,
  DeploymentStats,
  Device,
} from './types';

export {
  celsiusToFahrenheit,
  celsiusDeltaToFahrenheit,
  getLatestReading,
  getReadings,
  getAllReadings,
  getAllReadingsRange,
  getChartSamples,
  getDeviceStats,
  getDeployments,
  getDeployment,
  createDeployment,
  updateDeployment,
  endDeployment,
  deleteDeployment,
  getActiveDeployment,
  getDeploymentStats,
  getDeploymentReadings,
  getDistinctLocations,
  getDevices,
  createDevice,
  updateDevice,
  deactivateDevice,
  getDashboardLive,
} from './queries/index';
export type { DashboardLiveData } from './queries/index';
