'use client';

import { Reading, Deployment, celsiusToFahrenheit } from '@/lib/supabase';

interface LiveReadingCardProps {
  deviceId: string;
  deviceName: string;
  reading: Reading | null;
  activeDeployment?: Deployment | null;
  onClick?: () => void;
  onRefresh?: () => void;
  lastRefresh?: Date | null;
}

export function LiveReadingCard({ deviceId, deviceName, reading, activeDeployment, onClick, onRefresh, lastRefresh }: LiveReadingCardProps) {
  const isStale = reading
    ? Date.now() - new Date(reading.created_at).getTime() > 2 * 60 * 1000 // 2 minutes
    : true;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    if (diffHours > 0) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    if (diffMins > 0) return diffMins === 1 ? '1 min ago' : `${diffMins} mins ago`;
    return 'just now';
  };

  return (
    <div
      className={`glass-card p-8 card-reading ${onClick ? 'cursor-pointer hover:border-white/30 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {activeDeployment ? (
            <>
              <h2 className="text-2xl font-bold text-white">{activeDeployment.name}</h2>
              <span className="text-sm text-[#a0aec0]">{deviceName} &bull; Started {getTimeAgo(activeDeployment.started_at)}</span>
            </>
          ) : (
            <>
              <h2 className="text-xl font-medium text-[#a0aec0]">No Active Deployment</h2>
              <span className="text-sm text-[#a0aec0]">{deviceName} ({deviceId})</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {reading && !isStale && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#01b574] animate-pulse" />
              <span className="text-sm text-[#01b574]">Live</span>
            </div>
          )}
          {reading && isStale && (
            <span className="px-3 py-1 text-sm font-medium rounded-lg bg-[#ffb547]/20 text-[#ffb547]">
              Stale
            </span>
          )}
          {onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#a0aec0] hover:text-white transition-colors"
              title={lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {reading ? (
        <>
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="glass-card p-6 !rounded-xl !border-white/10">
              <p className="text-sm text-[#a0aec0] uppercase tracking-wider mb-3">Temperature</p>
              <p className="stat-value">
                {celsiusToFahrenheit(reading.temperature).toFixed(1)}
                <span className="text-xl text-[#a0aec0] font-normal ml-1">°F</span>
              </p>
              <p className="text-sm text-[#a0aec0] mt-2">
                {reading.temperature.toFixed(1)}°C
              </p>
            </div>
            <div className="glass-card p-6 !rounded-xl !border-white/10">
              <p className="text-sm text-[#a0aec0] uppercase tracking-wider mb-3">Humidity</p>
              <p className="stat-value">
                {reading.humidity.toFixed(1)}
                <span className="text-xl text-[#a0aec0] font-normal ml-1">%</span>
              </p>
            </div>
          </div>

          <div className="text-sm text-[#a0aec0]">
            {formatDate(reading.created_at)} at {formatTime(reading.created_at)}
          </div>
        </>
      ) : (
        <div className="flex flex-col justify-center flex-1 min-h-[140px]">
          <p className="text-xl text-[#a0aec0] font-medium text-center">No data available</p>
          <p className="text-sm text-[#a0aec0]/60 mt-2 text-center">Waiting for sensor...</p>
        </div>
      )}
    </div>
  );
}
