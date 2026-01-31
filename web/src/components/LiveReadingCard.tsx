'use client';

import { Reading, celsiusToFahrenheit } from '@/lib/supabase';

interface LiveReadingCardProps {
  deviceId: string;
  deviceName: string;
  reading: Reading | null;
}

export function LiveReadingCard({ deviceId, deviceName, reading }: LiveReadingCardProps) {
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

  return (
    <div className="glass-card p-8 card-reading">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">{deviceName}</h2>
          <span className="text-sm text-[#a0aec0]">{deviceId}</span>
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
