export { supabase } from './client';
export { getServerClient } from './server';

export type {
  Reading,
  ChartSample,
  DeviceStats,
  Deployment,
  DeploymentWithCount,
  DeploymentStats,
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
} from './queries/index';
