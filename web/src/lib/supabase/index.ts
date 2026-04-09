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
  DeviceAlertState,
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
  getActiveDeployments,
  getDeploymentStats,
  getDeploymentReadings,
  getDistinctLocations,
  getDevices,
  createDevice,
  updateDevice,
  deactivateDevice,
  getDashboardLive,
  getDeviceAlertStates,
} from './queries/index';
export type { DashboardLiveData } from './queries/index';
