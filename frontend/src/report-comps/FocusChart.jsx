import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import { colors } from '../theme/tokens';

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
        console.error("Failed to fetch chart data:", err);
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
        <div className="rounded-lg border border-border bg-page px-3 py-2 text-sm">
          <p className="text-fg-secondary">{`Time: ${label}s`}</p>
          <p className="font-medium text-fg">{`Focus: ${payload[0].value}%`}</p>
        </div>
      );
    }
    return null;
  };

  const axis = {
    tick: { fill: colors.fg.secondary, fontSize: 12 },
    axisLine: { stroke: colors.border },
    tickLine: { stroke: colors.border },
  };

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Focus trend</h2>
        {!loading && !error && <span className="text-sm text-fg-secondary">{duration}s</span>}
      </div>

      {loading ? (
        <div className="flex h-80 items-center justify-center text-sm text-fg-secondary">Loading chart data</div>
      ) : error ? (
        <div className="flex h-80 flex-col items-center justify-center text-center text-sm">
          <div className="text-fg">Unable to load data</div>
          <div className="mt-1 text-fg-muted">{error}</div>
        </div>
      ) : chartData.length > 0 ? (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <XAxis dataKey="time" {...axis} />
              <YAxis
                domain={[0, 100]}
                {...axis}
                label={{ value: 'Focus Score (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: colors.fg.secondary, fontSize: 12 } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="score"
                stroke={colors.accent}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: colors.accent, stroke: colors.page, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-80 items-center justify-center text-sm text-fg-secondary">No chart data available</div>
      )}
    </Card>
  );
};

export default FocusChart;
