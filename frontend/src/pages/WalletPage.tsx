import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Loader2, CreditCard, ShieldCheck, Zap, History } from 'lucide-react';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    Razorpay: any;
  }
}

import { useClient } from '../lib/ClientContext';

export default function WalletPage() {
  const { refreshCredits } = useClient();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (error) throw error;
      return data;
    }
  });
  
  const { data: transactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
      if (error && error.code !== '42P01') throw error; // Ignore relation doesn't exist yet
      return data || [];
    }
  });

  useEffect(() => {
    // Load Razorpay Script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const plans = [
    { id: 1, name: "Starter Bundle", credits: 500, price: 499, popular: false },
    { id: 2, name: "Pro Firm Bundle", credits: 2500, price: 1999, popular: true },
    { id: 3, name: "Enterprise Bulk", credits: 10000, price: 6999, popular: false }
  ];

  const handlePurchase = async (plan: typeof plans[0]) => {
    setSelectedPlan(plan.id);
    setIsProcessing(true);
    toast.loading("Initializing payment...", { id: 'payment' });
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication required");

      // 1. Create Order on Backend
      const orderRes = await fetch(`${apiUrl}/api/create-order`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: plan.price, credits: plan.credits }),
      });

      if (!orderRes.ok) throw new Error("Failed to create order");
      const orderData = await orderRes.json();

      if (!window.Razorpay) {
        throw new Error("Razorpay SDK failed to load. Please check your internet connection.");
      }

      // 2. Open Razorpay Checkout
      const options = {
        key: orderData.key_id, 
        amount: orderData.amount,
        currency: orderData.currency,
        name: "KhataLens Pro",
        description: `${plan.name} - ${plan.credits} Credits`,
        order_id: orderData.order_id,
        handler: async function (response: any) {
          toast.loading("Verifying payment...", { id: 'payment' });
          try {
            // 3. Verify Payment
            const verifyRes = await fetch(`${apiUrl}/api/verify-payment`, {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                credits: plan.credits,
                amount: plan.price
              }),
            });
            
            if (!verifyRes.ok) throw new Error("Payment verification failed");
            
            toast.success(`Successfully added ${plan.credits} credits!`, { id: 'payment' });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            refreshCredits();
          } catch (e: any) {
            toast.error(e.message || "Payment verification failed", { id: 'payment' });
          }
        },
        prefill: {
          email: session.user.email,
        },
        theme: {
          color: "#4f46e5"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (_response: any){
        toast.error("Payment failed or cancelled.", { id: 'payment' });
      });
      rzp.open();

    } catch (err: any) {
      toast.error(err.message || "Could not process payment", { id: 'payment' });
    } finally {
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Wallet & Billing</h1>
          <p className="text-text-secondary">Manage your AI credits and view transaction history.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-1">
          <div className="card bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 p-6 flex flex-col items-center text-center h-full justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-text-secondary font-medium mb-2">Available Credits</h2>
            <div className="text-5xl font-bold text-text-primary mb-4">{profile?.credits || 0}</div>
            <p className="text-sm text-text-disabled">1 Credit = 1 AI Invoice Scan</p>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2">
          <div className="card p-0 overflow-hidden h-full">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /> Recharge Credits</h2>
              <p className="text-sm text-text-secondary mt-1">Purchase a bundle to continue scanning. Secure payments via Razorpay.</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className={`border rounded-xl p-4 flex flex-col relative transition-all ${plan.popular ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]' : 'border-border hover:border-text-disabled'}`}>
                  {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Most Popular</span>}
                  
                  <div className="text-sm font-medium text-text-secondary mb-2 mt-2">{plan.name}</div>
                  <div className="text-2xl font-bold text-text-primary mb-1">{plan.credits}</div>
                  <div className="text-xs text-text-disabled mb-6">Credits</div>
                  
                  <div className="mt-auto">
                    <div className="text-xl font-bold text-text-primary mb-4">₹{plan.price}</div>
                    <button 
                      onClick={() => handlePurchase(plan)}
                      disabled={isProcessing}
                      className={`w-full py-2 rounded-lg font-medium transition-all flex justify-center items-center gap-2 ${plan.popular ? 'bg-primary text-white hover:bg-primary/90' : 'bg-bg-sunken text-text-primary border border-border hover:bg-bg-surface hover:border-text-secondary'}`}
                    >
                      {isProcessing && selectedPlan === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Purchase"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden mt-8">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><History className="w-5 h-5 text-text-secondary" /> Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="table-header">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Order ID</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Credits Added</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-text-secondary">No transactions found.</td>
                </tr>
              ) : (
                transactions?.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-bg-subtle transition-colors">
                    <td className="p-4 font-mono text-text-secondary">{new Date(tx.created_at).toLocaleDateString()}</td>
                    <td className="p-4 font-mono text-text-secondary">{tx.order_id || tx.payment_id}</td>
                    <td className="p-4 font-medium text-text-primary">₹{tx.amount_paid}</td>
                    <td className="p-4 font-bold text-success">+{tx.credits_added}</td>
                    <td className="p-4">
                      <span className="badge bg-success-subtle text-success border border-success/20 flex items-center gap-1 w-max">
                        <ShieldCheck className="w-3 h-3" /> {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
