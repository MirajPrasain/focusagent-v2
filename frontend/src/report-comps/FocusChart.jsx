import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const FocusChart = () => {
  const [chartData, setChartData] = useState([]);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFocusData = async () => {
      try {
        setLoading(true);
        setError(null);

        const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';
        const res = await axios.get(
          `${MEDIAPIPE_API_URL}/post-session?chart_type=focus`
        );
        
        setChartData(res.data.chart_data || []);
        setDuration(res.data.session_duration || 0);
      } catch (err) {
        console.error("❌ Failed to fetch chart data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFocusData();
  }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="relative">
          {/* Liquid Glass Effect */}
          <div className="absolute inset-0 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl"></div>
          <div className="relative px-4 py-3">
            <p className="text-white font-medium text-sm drop-shadow-sm">{`Time: ${label}s`}</p>
            <p className="text-blue-300 font-semibold text-sm drop-shadow-sm">{`Focus: ${payload[0].value}%`}</p>
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
          <div className="absolute inset-0 bg-gradient-to-tl from-blue-500/10 via-transparent to-purple-500/10 rounded-3xl opacity-60"></div>
          
          <div className="relative p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse shadow-lg shadow-blue-400/50"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Trend</h2>
            </div>
            <div className="flex items-center justify-center h-80">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce shadow-lg shadow-blue-400/50"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce shadow-lg shadow-blue-400/50" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce shadow-lg shadow-blue-400/50" style={{ animationDelay: '0.2s' }}></div>
                <span className="text-white/80 font-medium ml-3 drop-shadow-sm">Loading chart data</span>
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
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Trend</h2>
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
        <div className="absolute inset-0 bg-gradient-to-tl from-blue-500/10 via-transparent to-purple-500/10 rounded-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-80"></div>
        
        {/* Floating Highlight */}
        <div className="absolute top-4 left-4 w-32 h-32 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-2xl opacity-30 transition-all duration-700 group-hover:opacity-50"></div>
        
        <div className="relative p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50 animate-pulse"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Trend</h2>
            </div>
            <div className="text-right">
              <div className="text-white/90 font-medium text-sm drop-shadow-sm">Session Duration</div>
              <div className="text-blue-300 font-semibold text-lg drop-shadow-sm">{duration}s</div>
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <XAxis 
                    dataKey="time" 
                    tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                    label={{ value: 'Focus Score (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 } }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="url(#blueGradient)" 
                    strokeWidth={3} 
                    dot={{ fill: '#60A5FA', strokeWidth: 2, stroke: '#ffffff', r: 4, filter: 'drop-shadow(0 0 6px rgba(96, 165, 250, 0.8))' }}
                    activeDot={{ r: 6, fill: '#3B82F6', stroke: '#ffffff', strokeWidth: 2, filter: 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.9))' }}
                  />
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="50%" stopColor="#60A5FA" />
                      <stop offset="100%" stopColor="#93C5FD" />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <div className="w-8 h-8 text-white/60">📊</div>
                </div>
                <div className="text-white/80 font-medium drop-shadow-sm">No chart data available</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FocusChart;