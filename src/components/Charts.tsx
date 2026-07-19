import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { Invoice } from '../types';

interface ChartsProps {
  invoices: Invoice[];
}

export default function Charts({ invoices }: ChartsProps) {
  // 1. Calculate Revenue Over Time (by invoice date)
  // Let's group by Month-Year
  const monthlyDataMap: { [key: string]: { month: string; revenue: number; count: number } } = {};
  
  invoices.forEach((inv) => {
    if (!inv.date) return;
    
    // Parse date (expecting YYYY-MM-DD or standard formats)
    const dateObj = new Date(inv.date);
    if (isNaN(dateObj.getTime())) return;
    
    const monthYear = dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    
    if (!monthlyDataMap[monthYear]) {
      monthlyDataMap[monthYear] = { month: monthYear, revenue: 0, count: 0 };
    }
    // Only include Paid or Pending/Unpaid (exclude Archived if any)
    if (inv.status !== ('Archived' as any)) {
      monthlyDataMap[monthYear].revenue += inv.totalAmount;
      monthlyDataMap[monthYear].count += 1;
    }
  });

  const monthlyData = Object.values(monthlyDataMap).sort((a, b) => {
    const dateA = new Date(a.month + ' 01');
    const dateB = new Date(b.month + ' 01');
    return dateA.getTime() - dateB.getTime();
  });

  // 2. Status Distribution
  const statusCounts = {
    Paid: 0,
    Unpaid: 0,
    Pending: 0,
    Overdue: 0,
  };

  invoices.forEach((inv) => {
    if (inv.status in statusCounts) {
      statusCounts[inv.status as keyof typeof statusCounts] += inv.totalAmount;
    }
  });

  const statusData = [
    { name: 'Paid', value: statusCounts.Paid, color: '#10B981' }, // emerald-500
    { name: 'Unpaid', value: statusCounts.Unpaid, color: '#F43F5E' }, // rose-500
    { name: 'Pending', value: statusCounts.Pending, color: '#F59E0B' }, // amber-500
    { name: 'Overdue', value: statusCounts.Overdue, color: '#8B5CF6' }, // violet-500
  ].filter(item => item.value > 0);

  // 3. Top Customers
  const customerMap: { [key: string]: number } = {};
  invoices.forEach((inv) => {
    if (!inv.customerName) return;
    if (inv.status === ('Archived' as any)) return;
    customerMap[inv.customerName] = (customerMap[inv.customerName] || 0) + inv.totalAmount;
  });

  const customerData = Object.entries(customerMap)
    .map(([name, total]) => ({ name, revenue: Math.round(total) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5); // top 5

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" id="invoice-charts-grid">
      {/* Revenue Trend Area Chart */}
      <div className="bg-white p-6 rounded-3xl border border-white shadow-sm shadow-slate-200/60 col-span-1 lg:col-span-2" id="chart-revenue-trend">
        <h3 className="text-sm font-black text-slate-800 mb-4">Revenue Trend</h3>
        <div className="h-64">
          {monthlyData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 font-medium">
              No revenue data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ background: '#1E293B', borderRadius: '12px', border: 'none', color: '#FFF' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Status Breakdown Donut Chart */}
      <div className="bg-white p-6 rounded-3xl border border-white shadow-sm shadow-slate-200/60" id="chart-status-breakdown">
        <h3 className="text-sm font-black text-slate-800 mb-4">Status Value Distribution</h3>
        <div className="h-64 relative flex items-center justify-center">
          {statusData.length === 0 ? (
            <div className="text-slate-400 font-medium">No status data available</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [formatCurrency(value), 'Value']}
                    contentStyle={{ background: '#1E293B', borderRadius: '12px', border: 'none', color: '#FFF' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Custom Legend inside/under the center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Value</span>
                <span className="text-lg font-black text-slate-800">
                  {formatCurrency(statusData.reduce((acc, curr) => acc + curr.value, 0))}
                </span>
              </div>
            </>
          )}
        </div>
        {/* Simple Legend List */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
          {statusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}: {formatCurrency(item.value)}
            </div>
          ))}
        </div>
      </div>

      {/* Top Customers Bar Chart */}
      <div className="bg-white p-6 rounded-3xl border border-white shadow-sm shadow-slate-200/60 col-span-1 lg:col-span-3" id="chart-top-customers">
        <h3 className="text-sm font-black text-slate-800 mb-4">Top Customers by Revenue</h3>
        <div className="h-64">
          {customerData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 font-medium">
              No customer data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ background: '#1E293B', borderRadius: '12px', border: 'none', color: '#FFF' }}
                />
                <Bar dataKey="revenue" fill="#4F46E5" radius={[0, 8, 8, 0]} maxBarSize={30}>
                  {customerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : '#4F46E5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
