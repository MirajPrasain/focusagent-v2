import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

const eventLabels = {
  0: "Phone Detected",
  1: "Looking Down",
  2: "Head Turn",
  3: "Multiple Faces",
  4: "No Face",
  5: "Low Focus"
};

const CheatChart = () => {
  const [cheatData, setCheatData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCheatData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';
        const res = await axios.get(
          `${MEDIAPIPE_API_URL}/post-session?chart_type=cheat`
        );

        // Transform to scatter plot format
        const formatted = res.data.chart_data.map(item => ({
          time: item.time,
          event: item.event
        }));

        setCheatData(formatted);
      } catch (err) {
        console.error('Error fetching cheat chart data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCheatData();
  }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const eventType = payload[0].value;
      return (
        <div className="relative">
          {/* Liquid Glass Effect */}
          <div className="absolute inset-0 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl"></div>
          <div className="relative px-4 py-3">
            <p className="text-white font-medium text-sm drop-shadow-sm">{`Time: ${label}s`}</p>
            <p className="text-red-300 font-semibold text-sm drop-shadow-sm">{eventLabels[eventType] || `Type ${eventType}`}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <div className="relative group animate-scale-in">
          {/* Liquid Glass Container */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
          <div className="absolute inset-0 bg-gradient-to-tl from-red-500/10 via-transparent to-orange-500/10 rounded-3xl opacity-60"></div>
          
          <div className="relative p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse shadow-lg shadow-red-400/50"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Distraction Timeline</h2>
            </div>
            <div className="flex items-center justify-center h-80">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce shadow-lg shadow-red-400/50"></div>
                <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce shadow-lg shadow-red-400/50" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce shadow-lg shadow-red-400/50" style={{ animationDelay: '0.2s' }}></div>
                <span className="text-white/80 font-medium ml-3 drop-shadow-sm">Loading distraction data</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <div className="relative group animate-scale-in">
          {/* Liquid Glass Container */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
          <div className="absolute inset-0 bg-gradient-to-tl from-red-500/10 via-transparent to-orange-500/10 rounded-3xl opacity-60"></div>
          
          <div className="relative p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg shadow-red-400/50"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Distraction Timeline</h2>
            </div>
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-400/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-red-400/30">
                  <div className="w-6 h-6 border-2 border-red-400 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div className="text-red-300 font-medium drop-shadow-sm">Unable to load data</div>
                <div className="text-white/60 text-sm mt-1 drop-shadow-sm">{error}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="relative group animate-scale-in">
        {/* Liquid Glass Container */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl transition-all duration-700 group-hover:bg-white/8"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
        <div className="absolute inset-0 bg-gradient-to-tl from-red-500/10 via-transparent to-orange-500/10 rounded-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-80"></div>
        
        {/* Floating Highlight */}
        <div className="absolute top-4 right-4 w-32 h-32 bg-gradient-to-bl from-white/20 to-transparent rounded-full blur-2xl opacity-30 transition-all duration-700 group-hover:opacity-50"></div>
        
        <div className="relative p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-red-400 rounded-full shadow-lg shadow-red-400/50 animate-pulse"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Distraction Timeline</h2>
            </div>
            <div className="text-right">
              <div className="text-white/90 font-medium text-sm drop-shadow-sm">Total Events</div>
              <div className="text-red-300 font-semibold text-lg drop-shadow-sm">{cheatData.length}</div>
            </div>
          </div>

          {cheatData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid 
                    strokeDasharray="3 3" 
                    stroke="rgba(255,255,255,0.15)" 
                    horizontal={true}
                    vertical={false}
                  />
                  <XAxis 
                    dataKey="time" 
                    name="Time (s)" 
                    unit="s" 
                    tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <YAxis
                    dataKey="event"
                    tickFormatter={(value) => eventLabels[value] || `Type ${value}`}
                    allowDecimals={false}
                    tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    label={{ 
                      value: "Distraction Type", 
                      angle: -90, 
                      position: "insideLeft",
                      style: { textAnchor: 'middle', fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ 
                      color: 'rgba(255,255,255,0.9)', 
                      fontSize: '14px', 
                      fontWeight: 500 
                    }} 
                  />
                  <Scatter 
                    name="Distraction Events" 
                    data={cheatData} 
                    fill="#EF4444"
                    stroke="#ffffff"
                    strokeWidth={1}
                    r={6}
                    style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-400/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-green-400/30 shadow-lg shadow-green-400/20">
                  <div className="text-2xl">🎉</div>
                </div>
                <div className="text-green-300 font-semibold text-lg mb-2 drop-shadow-sm">Perfect Focus!</div>
                <div className="text-white/80 font-medium drop-shadow-sm">No distractions detected</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheatChart;