import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import { colors } from '../theme/tokens';

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

  const COLORS = [colors.accent, colors.distracted]; // Focused, Distracted

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const totalValue = payload.reduce((sum, item) => sum + item.value, 0);
      const percentage = ((data.value / totalValue) * 100).toFixed(1);

      return (
        <div className="rounded-lg border border-border bg-page px-3 py-2 text-sm">
          <p className="text-fg-secondary">{data.name}</p>
          <p className="font-medium text-fg">{`${data.value} events (${percentage}%)`}</p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }) => {
    return (
      <div className="mt-4 flex justify-center gap-6">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-sm text-fg-secondary">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const focusPercentage = totalValue > 0 ? ((data.find(d => d.name === 'Focused')?.value || 0) / totalValue * 100).toFixed(1) : 0;

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Focus distribution</h2>
        {!loading && !error && <span className="text-sm text-fg-secondary">{focusPercentage}% focused</span>}
      </div>

      {loading ? (
        <div className="flex h-80 items-center justify-center text-sm text-fg-secondary">Loading focus distribution</div>
      ) : error ? (
        <div className="flex h-80 flex-col items-center justify-center text-center text-sm">
          <div className="text-fg">Unable to load data</div>
          <div className="mt-1 text-fg-muted">{error}</div>
        </div>
      ) : data.length > 0 && totalValue > 0 ? (
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
                stroke={colors.surface}
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-80 items-center justify-center text-sm text-fg-secondary">No focus data available</div>
      )}
    </Card>
  );
};

export default FocusDonutChart;
