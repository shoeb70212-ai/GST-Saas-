
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { Skeleton } from './ui/Skeleton';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f43f5e', '#84cc16'];
const RECON_COLORS = {
  matched: '#10b981',
  mismatch: '#f59e0b',
  missing_in_2b: '#ef4444',
  missing_in_pr: '#f43f5e',
  unreconciled: '#94a3b8'
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-surface border border-border p-3 rounded-lg shadow-xl text-sm z-50 relative">
        <p className="font-medium text-text-primary mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color || p.payload.fill }} className="flex justify-between gap-4">
            <span>{p.name}:</span>
            <span className="font-mono font-bold">{formatCurrency(p.value)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export interface AnalyticsData {
  trends: { month: string; total_spend: number; total_taxable: number }[];
  categories: { category: string; total_spend: number }[];
  vendors: { vendor: string; total_spend: number }[];
  recon: { status: string; count: number }[];
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card h-80 w-full p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-full w-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card h-64 p-6">
             <Skeleton className="h-6 w-32 mb-4" />
             <div className="flex items-center justify-center h-full pb-8">
               <Skeleton className="h-32 w-32 rounded-full" />
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, icon: Icon }: { title: string, icon: any }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-text-secondary opacity-50 min-h-[200px]">
      <Icon className="w-10 h-10 mb-2" />
      <p className="text-sm">Not enough data for {title}</p>
    </div>
  );
}

export default function AnalyticsCharts({ data }: { data: AnalyticsData | null }) {
  if (!data) return <AnalyticsSkeleton />;

  const hasData = data.trends.length > 0 || data.categories.length > 0;

  if (!hasData) {
    return (
      <div className="card p-12 text-center border-dashed border-2 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-bg-sunken rounded-full flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-text-disabled" />
        </div>
        <h3 className="text-lg font-bold text-text-primary mb-2">No Analytics Data Yet</h3>
        <p className="text-text-secondary max-w-sm">
          Scan some invoices to see visual breakdowns of your spending, vendor distribution, and category trends.
        </p>
      </div>
    );
  }

  // Format Reconcilation data labels
  const reconDataFormatted = data.recon.map(r => ({
    ...r,
    label: r.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    fill: RECON_COLORS[r.status as keyof typeof RECON_COLORS] || RECON_COLORS.unreconciled
  }));

  return (
    <div className="space-y-6">
      {/* Top Row: Trend Chart */}
      <div className="card p-6 border-accent/10 relative overflow-hidden">
        <h3 className="text-lg font-bold text-text-primary mb-6">Spending Trend (Last 6 Months)</h3>
        {data.trends.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="total_spend" 
                  name="Total Spend"
                  stroke="#6366f1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorSpend)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="Spending Trend" icon={BarChart3} />
        )}
      </div>

      {/* Bottom Row: 3 smaller charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Categories Pie Chart */}
        <div className="card p-6">
          <h3 className="text-base font-bold text-text-primary mb-4">Spend by Category</h3>
          {data.categories.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categories}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="total_spend"
                    nameKey="category"
                  >
                    {data.categories.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Categories" icon={PieChartIcon} />
          )}
        </div>

        {/* Top Vendors Bar Chart */}
        <div className="card p-6">
          <h3 className="text-base font-bold text-text-primary mb-4">Top 5 Vendors</h3>
          {data.vendors.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.vendors} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="vendor" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false}
                    width={80}
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                  <Bar dataKey="total_spend" name="Spend" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Vendors" icon={BarChart3} />
          )}
        </div>

        {/* Reconciliation Health Donut Chart */}
        <div className="card p-6">
          <h3 className="text-base font-bold text-text-primary mb-4">Reconciliation Health</h3>
          {data.recon.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reconDataFormatted}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                  >
                    {reconDataFormatted.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--color-text-primary)', fontSize: '14px' }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
             <EmptyState title="Reconciliation" icon={PieChartIcon} />
          )}
        </div>

      </div>
    </div>
  );
}
