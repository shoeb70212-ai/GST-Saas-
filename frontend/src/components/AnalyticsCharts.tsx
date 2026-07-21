import { Link } from 'react-router-dom';
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
import { BarChart3, ScanLine, Network, Banknote, ArrowRight } from 'lucide-react';
import { formatCurrency } from '../utils/format';

const COLORS = ['#B56A3A', '#2F6F8F', '#3D6B55', '#5C5A8A', '#A65D12', '#1B6B45', '#5A615C', '#964F2A', '#4A5D70', '#141614'];
const RECON_COLORS = {
  matched: '#1B6B45',
  mismatch: '#A65D12',
  missing_in_2b: '#B42318',
  missing_in_pr: '#B42318',
  unreconciled: '#9AA19B'
};

const ACCENT = '#B56A3A';

type TooltipPayloadItem = {
  name?: string;
  value?: number;
  color?: string;
  payload?: { fill?: string };
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-surface border border-border p-3 rounded-lg shadow-lg text-sm z-50 relative">
        <p className="font-medium text-text-primary mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color || p.payload?.fill }} className="flex justify-between gap-4">
            <span>{p.name}:</span>
            <span className="font-mono font-semibold">{formatCurrency(p.value ?? 0)}</span>
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
  vendor_health?: { vendor_name: string; supplier_gstin: string; supplier_gstin_status: string; itc_at_risk: number; invoice_count: number }[];
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-bg-surface border border-border rounded-xl p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartEmptyPanel({
  title,
  body,
  to,
  cta,
  icon: Icon,
}: {
  title: string;
  body: string;
  to: string;
  cta: string;
  icon: typeof ScanLine;
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-bg-sunken border border-border flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-text-secondary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{body}</p>
        </div>
      </div>
      <Link to={to} className="btn-secondary !h-9 !text-xs mt-auto self-start">
        {cta} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function AnalyticsEmptyState() {
  return (
    <section aria-labelledby="analytics-empty-heading" className="space-y-3">
      <div>
        <h2 id="analytics-empty-heading" className="text-base font-display font-semibold text-text-primary">
          Charts unlock after desk data
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          No fake placeholders — scan invoices or upload 2B / bank files to populate trends.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ChartEmptyPanel
          title="Scan invoices"
          body="Extract taxable, CGST/SGST/IGST, and vendor fields from PDFs or photos."
          to="/app/scan"
          cta="Open scanner"
          icon={ScanLine}
        />
        <ChartEmptyPanel
          title="Upload GSTR-2B"
          body="Run match to see reconciliation health instead of empty pie shells."
          to="/app/reconcile"
          cta="Open GSTR-2B"
          icon={Network}
        />
        <ChartEmptyPanel
          title="Upload bank statement"
          body="Parse withdrawals so bank match can allocate payments against invoices."
          to="/app/bank-statements"
          cta="Upload bank"
          icon={Banknote}
        />
      </div>
    </section>
  );
}

export default function AnalyticsCharts({ data }: { data: AnalyticsData | null }) {
  if (!data) return <AnalyticsEmptyState />;

  const hasData = data.trends.length > 0 || data.categories.length > 0 || data.vendors.length > 0 || data.recon.length > 0;

  if (!hasData) {
    return <AnalyticsEmptyState />;
  }

  const reconDataFormatted = data.recon.map(r => ({
    ...r,
    label: r.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    fill: RECON_COLORS[r.status as keyof typeof RECON_COLORS] || RECON_COLORS.unreconciled
  }));

  return (
    <div className="space-y-6">
      <div className="bg-bg-surface border border-border rounded-xl p-5">
        <h3 className="text-base font-display font-semibold text-text-primary mb-4">Spending trend (last 6 months)</h3>
        {data.trends.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ACCENT} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={ACCENT} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total_spend"
                  name="Total Spend"
                  stroke={ACCENT}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorSpend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyPanel
            title="No spend trend yet"
            body="Scan invoices across months to plot taxable spend."
            to="/app/scan"
            cta="Scan invoices"
            icon={ScanLine}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Spend by category</h3>
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
            <ChartEmptyPanel
              title="Categories empty"
              body="Categorised invoices will fill this breakdown."
              to="/app/scan"
              cta="Scan invoices"
              icon={ScanLine}
            />
          )}
        </div>

        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Top 5 vendors</h3>
          {data.vendors.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.vendors} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="vendor"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    width={80}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(181, 106, 58, 0.06)' }} />
                  <Bar dataKey="total_spend" name="Spend" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmptyPanel
              title="No vendor spend yet"
              body="Vendor totals appear after you scan purchase invoices."
              to="/app/scan"
              cta="Scan invoices"
              icon={BarChart3}
            />
          )}
        </div>

        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Reconciliation health</h3>
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
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--text-primary)', fontSize: '14px' }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmptyPanel
              title="No 2B match yet"
              body="Upload GSTR-2B and run reconcile to see matched vs missing."
              to="/app/reconcile"
              cta="Open GSTR-2B"
              icon={Network}
            />
          )}
        </div>
      </div>
    </div>
  );
}
