import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { Invoice } from '../types';

interface ChartsProps {
  invoices: Invoice[];
}

export default function Charts({ invoices }: ChartsProps) {
  // Revenue Over Time grouped by Month-Year
  const monthlyDataMap: { [key: string]: { month: string; revenue: number; count: number } } = {};
  
  invoices.forEach((inv) => {
    if (!inv.date) return;
    const dateObj = new Date(inv.date);
    if (isNaN(dateObj.getTime())) return;
    const monthYear = dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    
    if (!monthlyDataMap[monthYear]) {
      monthlyDataMap[monthYear] = { month: monthYear, revenue: 0, count: 0 };
    }
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

  // Status Distribution
  const statusCounts = { Paid: 0, Unpaid: 0, Pending: 0, Overdue: 0 };
  invoices.forEach((inv) => {
    if (inv.status in statusCounts) {
      statusCounts[inv.status as keyof typeof statusCounts] += inv.totalAmount;
    }
  });

  const statusData = [
    { name: 'Paid', value: statusCounts.Paid, color: '#10B981' },
    { name: 'Unpaid', value: statusCounts.Unpaid, color: '#F43F5E' },
    { name: 'Pending', value: statusCounts.Pending, color: '#F59E0B' },
    { name: 'Overdue', value: statusCounts.Overdue, color: '#8B5CF6' },
  ].filter(item => item.value > 0);

  // Top Customers
  const customerMap: { [key: string]: number } = {};
  invoices.forEach((inv) => {
    if (!inv.customerName) return;
    if (inv.status === ('Archived' as any)) return;
    customerMap[inv.customerName] = (customerMap[inv.customerName] || 0) + inv.totalAmount;
  });

  const customerData = Object.entries(customerMap)
    .map(([name, total]) => ({ name, revenue: Math.round(total) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const CustomTooltipStyle = {
    background: '#1E293B',
    borderRadius: '12px',
    border: 'none',
    color: '#FFF',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    padding: '10px 14px',
    fontSize: '12px'
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="invoice-charts-grid">
      {/* Revenue Trend */}
      <div className="col-span-1 lg:col-span-2" id="chart-revenue-trend">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Revenue Trend</h3>
        <div className="h-56">
          {monthlyData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-300 font-medium text-sm">
              No revenue data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#CBD5E1" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#CBD5E1" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={CustomTooltipStyle}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Status Donut */}
      <div id="chart-status-breakdown">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Status Breakdown</h3>
        <div className="h-56 relative flex items-center justify-center">
          {statusData.length === 0 ? (
            <div className="text-gray-300 font-medium text-sm">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => [formatCurrency(value), 'Value']}
                    contentStyle={CustomTooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-gray-400 font-medium uppercase">Total</span>
                <span className="text-lg font-bold text-gray-800">
                  {formatCurrency(statusData.reduce((acc, curr) => acc + curr.value, 0))}
                </span>
              </div>
            </>
          )}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-3">
          {statusData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </div>
          ))}
        </div>
      </div>

      {/* Top Customers */}
      <div className="col-span-1 lg:col-span-3" id="chart-top-customers">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Top Customers</h3>
        <div className="h-48">
          {customerData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-300 font-medium text-sm">
              No customer data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" stroke="#CBD5E1" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} width={100} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={CustomTooltipStyle}
                />
                <Bar dataKey="revenue" radius={[0, 8, 8, 0]} maxBarSize={28}>
                  {customerData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#6366F1' : index === 1 ? '#818CF8' : '#C7D2FE'} />
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
