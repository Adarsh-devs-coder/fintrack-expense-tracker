import { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#64748b'];

export default function AnalyticsPanel({ thisMonthExpenses, allExpenses, totalSpentThisMonth }) {
  const [chartMode, setChartMode] = useState('pie');

  const pieItems = useMemo(() => {
    const grouped = {};
    thisMonthExpenses.forEach((row) => {
      grouped[row.category] = (grouped[row.category] || 0) + Number(row.amount);
    });

    return Object.keys(grouped).map((cat) => ({
      name: cat,
      value: Number(grouped[cat].toFixed(2)),
      percentage: totalSpentThisMonth > 0
        ? ((grouped[cat] / totalSpentThisMonth) * 100).toFixed(1)
        : 0
    }));
  }, [thisMonthExpenses, totalSpentThisMonth]);

  const dailyBars = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = d.toDateString();
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      const sum = allExpenses
        .filter((item) => new Date(item.date).toDateString() === dayKey)
        .reduce((acc, item) => acc + Number(item.amount), 0);

      result.push({ date: label, amount: Number(sum.toFixed(2)) });
    }
    return result;
  }, [allExpenses]);

  return (
    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {chartMode === 'pie' ? 'Category Breakdown' : '7-Day Trend'}
          </h2>
          <p className="text-xs text-slate-500">
            {chartMode === 'pie' ? 'Monthly share per category' : 'Daily spending comparison'}
          </p>
        </div>

        <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setChartMode('pie')}
            className={`px-2.5 py-1 rounded ${
              chartMode === 'pie' ? 'bg-white text-slate-900 font-medium shadow-sm' : 'text-slate-600'
            }`}
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => setChartMode('bar')}
            className={`px-2.5 py-1 rounded ${
              chartMode === 'bar' ? 'bg-white text-slate-900 font-medium shadow-sm' : 'text-slate-600'
            }`}
          >
            7-Day Trend
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[260px]">
        {chartMode === 'pie' ? (
          pieItems.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieItems}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percentage }) => `${name} (${percentage}%)`}
                >
                  {pieItems.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={PALETTE[idx % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val, name, props) => [
                    `₹${val} (${props.payload.percentage}%)`,
                    name
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 py-20 text-center">
              No expenses recorded this month.
            </p>
          )
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailyBars} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val) => [`₹${val}`, 'Spent']} />
              <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}