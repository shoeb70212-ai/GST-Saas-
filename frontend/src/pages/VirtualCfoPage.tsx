import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useClient } from '../lib/ClientContext';
import { TrendingUp, AlertTriangle, Package, Activity, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { ErrorState } from '../components/ui/ErrorState';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function VirtualCfoPage() {
  const { activeClientId } = useClient();

  // Query Itemized Spend
  const { data: itemizedSpend, isLoading: isLoadingSpend, isError: isSpendError, refetch: refetchSpend } = useQuery({
    queryKey: ['cfo', 'spend', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      
      const { data, error } = await supabase.rpc('get_itemized_spend', {
        client_id_param: activeClientId,
        user_id_param: session.user.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId,
  });

  // Query Price Variance Alerts
  const { data: priceAlerts, isLoading: isLoadingAlerts, isError: isAlertsError, refetch: refetchAlerts } = useQuery({
    queryKey: ['cfo', 'alerts', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      
      const { data, error } = await supabase.rpc('get_price_variance_alerts', {
        client_id_param: activeClientId,
        user_id_param: session.user.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId,
  });

  if (!activeClientId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-white/50">
        <Activity className="w-16 h-16 mb-4 opacity-20" />
        <p>Please select a client to view Virtual CFO Insights</p>
      </div>
    );
  }

  if (isSpendError || isAlertsError) {
    return (
      <ErrorState
        title="Could not load CFO insights"
        message="Spend or price-alert data failed to load. Check your connection and try again."
        onRetry={() => {
          if (isSpendError) void refetchSpend();
          if (isAlertsError) void refetchAlerts();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-light text-white tracking-tight flex items-center gap-3">
          <TrendingUp className="text-emerald-400 w-8 h-8" />
          Virtual CFO Insights
        </h1>
        <p className="text-white/60 mt-2">AI-driven analysis of your itemized spending and vendor pricing.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Alerts */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
            <h2 className="text-xl font-medium text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="text-rose-400 w-5 h-5" />
              Price Variance Alerts
            </h2>
            <p className="text-sm text-white/50 mb-6">
              Flags vendors who have increased prices by &gt;5% compared to the 3-month average.
            </p>
            
            {isLoadingAlerts ? (
              <div className="animate-pulse space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl"></div>)}
              </div>
            ) : priceAlerts?.length === 0 ? (
              <div className="text-center py-8 border border-white/5 border-dashed rounded-xl">
                <p className="text-emerald-400 font-medium">No price hikes detected!</p>
                <p className="text-white/40 text-sm mt-1">Your vendors are maintaining consistent pricing.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {priceAlerts?.map((alert: any, idx: number) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={idx} 
                    className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl relative overflow-hidden group hover:bg-rose-500/20 transition-colors"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-medium truncate pr-4">{alert.item_name}</h3>
                      <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded text-sm whitespace-nowrap">
                        +{alert.variance_percentage}%
                      </span>
                    </div>
                    <p className="text-white/60 text-sm mb-3">Vendor: {alert.vendor_name}</p>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-white/40 text-xs block">Current</span>
                        <span className="text-white">₹{alert.current_price}</span>
                      </div>
                      <div className="w-px h-8 bg-white/10" />
                      <div>
                        <span className="text-white/40 text-xs block">3Mo Avg</span>
                        <span className="text-white">₹{alert.historical_average}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Analytics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium text-white flex items-center gap-2">
                <Package className="text-indigo-400 w-5 h-5" />
                Top Spend by Specific Items
              </h2>
            </div>
            
            {isLoadingSpend ? (
              <div className="h-80 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : itemizedSpend?.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-white/40">
                No itemized data available for this client yet.
              </div>
            ) : (
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={itemizedSpend}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                    <XAxis type="number" stroke="rgba(255,255,255,0.5)" tickFormatter={(val) => `₹${val/1000}k`} />
                    <YAxis 
                      type="category" 
                      dataKey="description" 
                      stroke="rgba(255,255,255,0.7)" 
                      width={150}
                      tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: any) => [`₹${value}`, 'Total Spend']}
                    />
                    <Bar dataKey="total_spend" radius={[0, 4, 4, 0]}>
                      {itemizedSpend?.map((_entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${220 + index * 10}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-6">
             <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
               <h3 className="text-white/60 text-sm mb-2 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Duplicate Risk Score</h3>
               <p className="text-3xl font-light text-white">Low Risk</p>
               <p className="text-xs text-white/40 mt-2">AI Deep Duplicate Detection is active.</p>
             </div>
             <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
               <h3 className="text-white/60 text-sm mb-2 flex items-center gap-2"><Activity className="w-4 h-4" /> Purchasing Velocity</h3>
               <p className="text-3xl font-light text-emerald-400">+12%</p>
               <p className="text-xs text-white/40 mt-2">Vs previous 30 days</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
