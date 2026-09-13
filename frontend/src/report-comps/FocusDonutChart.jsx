import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FocusDonutChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDonutData = async () => {
      try {
        setLoading(true);
        setError(null);

        const MEDIAPIPE_API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';
        const res = await axios.get(
          `${MEDIAPIPE_API_URL}/post-session?chart_type=focus-donut`
        );

        const chartData = [
          { name: "Focused", value: res.data.focus_pie || 0 },
          { name: "Distracted", value: res.data.cheat_pie || 0 }
        ];
        setData(chartData);
      } catch (err) {
        console.error("Failed to fetch donut chart data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDonutData();
  }, []);

  const COLORS = ['#10B981', '#EF4444']; // Emerald for focus, red for distraction

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const totalValue = payload.reduce((sum, item) => sum + item.value, 0);
      const percentage = ((data.value / totalValue) * 100).toFixed(1);
      
      return (
        <div className="relative">
          {/* Liquid Glass Effect */}
          <div className="absolute inset-0 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl"></div>
          <div className="relative px-4 py-3">
            <p className="text-white font-medium text-sm drop-shadow-sm">{data.name}</p>
            <p className="text-blue-300 font-semibold text-sm drop-shadow-sm">{`${data.value} events (${percentage}%)`}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }) => {
    return (
      <div className="flex justify-center space-x-8 mt-6">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full shadow-lg"
              style={{ 
                backgroundColor: entry.color,
                boxShadow: `0 0 12px ${entry.color}60`
              }}
            ></div>
            <span className="text-white/90 font-medium text-sm drop-shadow-sm">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12">
        <div className="relative group animate-scale-in">
          {/* Liquid Glass Container */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
          <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/10 via-transparent to-emerald-500/10 rounded-3xl opacity-60"></div>
          
          <div className="relative p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse shadow-lg shadow-purple-400/50"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Distribution</h2>
            </div>
            <div className="flex items-center justify-center h-80">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce shadow-lg shadow-purple-400/50"></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce shadow-lg shadow-purple-400/50" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce shadow-lg shadow-purple-400/50" style={{ animationDelay: '0.2s' }}></div>
                <span className="text-white/80 font-medium ml-3 drop-shadow-sm">Loading focus distribution</span>
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
              <div className="w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-400/50"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Distribution</h2>
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

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const focusPercentage = totalValue > 0 ? ((data.find(d => d.name === 'Focused')?.value || 0) / totalValue * 100).toFixed(1) : 0;

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <div className="relative group animate-scale-in">
        {/* Liquid Glass Container */}
        <div className="absolute inset-0 bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl transition-all duration-700 group-hover:bg-white/8"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl"></div>
        <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/10 via-transparent to-emerald-500/10 rounded-3xl opacity-60 transition-opacity duration-700 group-hover:opacity-80"></div>
        
        {/* Floating Highlight */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-gradient-to-r from-white/20 to-transparent rounded-full blur-3xl opacity-20 transition-all duration-700 group-hover:opacity-40"></div>
        
        <div className="relative p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-purple-400 rounded-full shadow-lg shadow-purple-400/50 animate-pulse"></div>
              <h2 className="text-2xl font-semibold text-white tracking-tight drop-shadow-sm">Focus Distribution</h2>
            </div>
            <div className="text-right">
              <div className="text-white/90 font-medium text-sm drop-shadow-sm">Focus Rate</div>
              <div className="text-green-300 font-semibold text-lg drop-shadow-sm">{focusPercentage}%</div>
            </div>
          </div>

          {data.length > 0 && totalValue > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={2}
                  >
                    {data.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]}
                        style={{
                          filter: `drop-shadow(0 0 12px ${COLORS[index % COLORS.length]}60)`,
                          transition: 'all 0.3s ease'
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={<CustomLegend />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-80">
              <div className="text-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                  <div className="w-8 h-8 text-white/60">🧠</div>
                </div>
                <div className="text-white/80 font-medium drop-shadow-sm">No focus data available</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FocusDonutChart;