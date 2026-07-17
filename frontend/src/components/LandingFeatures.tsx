
import { FileText, CheckCircle2, Smartphone, Network } from 'lucide-react';

export function BankStatementDemo() {
  return (
    <div className="bg-bg-surface rounded-2xl p-6 border border-border shadow-xl space-y-4">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <span className="font-display font-semibold text-text-primary">HDFC Bank Statement.pdf</span>
        <span className="px-3 py-1 bg-success/10 text-success text-xs font-bold rounded-full border border-success/20 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Extracted
        </span>
      </div>
      <div className="space-y-3">
        {[
          { date: '12/05', desc: 'NEFT-UBIN-TechCorp', amount: '+ ₹1,18,000' },
          { date: '14/05', desc: 'UPI/Zomato/Food', amount: '- ₹850' },
          { date: '15/05', desc: 'RTGS-SBIN-SteelCorp', amount: '- ₹29,500' },
        ].map((txn, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-bg-sunken border border-border">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-text-secondary w-10">{txn.date}</span>
              <span className="text-sm text-text-primary font-medium truncate max-w-[120px]">{txn.desc}</span>
            </div>
            <span className={`text-sm font-mono font-bold ${txn.amount.startsWith('+') ? 'text-success' : 'text-text-primary'}`}>
              {txn.amount}
            </span>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border flex justify-between items-center text-xs text-text-secondary">
        <span>Total deposits: ₹1,18,000</span>
        <span>Balance: ₹8,45,200</span>
      </div>
    </div>
  );
}

export function WhatsAppDemo() {
  return (
    <div className="relative bg-[#efeae2] rounded-2xl p-6 shadow-xl overflow-hidden h-64 flex flex-col justify-end">
      {/* Fake WhatsApp background pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")' }} />
      
      <div className="relative z-10 space-y-4">
        {/* User Message */}
        <div className="flex justify-end">
          <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-l-xl rounded-tr-xl shadow-sm text-sm max-w-[80%] flex flex-col gap-2">
            <div className="w-full h-24 bg-black/10 rounded-lg flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 blur-sm bg-gradient-to-br from-gray-300 to-gray-400" />
              <Smartphone className="w-8 h-8 text-black/50 relative z-10" />
            </div>
            <span>Here's the restaurant bill</span>
            <span className="text-[10px] text-black/40 text-right -mt-1">10:42 AM</span>
          </div>
        </div>

        {/* Bot Reply */}
        <div className="flex justify-start">
          <div className="bg-white text-[#111b21] p-3 rounded-r-xl rounded-tl-xl shadow-sm text-sm max-w-[90%] border border-black/5">
            <div className="font-semibold text-[#00a884] mb-1">KhataLens AI</div>
            <p className="leading-relaxed">✅ Extracted successfully.<br/>Vendor: <b>Biryani House</b><br/>Amount: <b>₹1,250</b><br/>Mapped to: <i>Meals & Entertainment</i></p>
            <span className="text-[10px] text-black/40 text-right block mt-1">10:43 AM</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReconciliationDemo() {
  return (
    <div className="space-y-4">
      {/* Invoice */}
      <div className="bg-bg-surface p-4 rounded-xl border border-border shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-text-secondary" />
          <div>
            <div className="text-sm font-semibold text-text-primary">Steel Corp Invoice</div>
            <div className="text-xs text-text-disabled">INV-2026-041</div>
          </div>
        </div>
        <div className="text-sm font-mono font-bold text-text-primary">₹29,500</div>
      </div>

      {/* Match Lines */}
      <div className="flex justify-center -my-2 relative z-10">
        <div className="flex items-center gap-2 px-3 py-1 bg-accent-subtle rounded-full border border-accent/20">
          <Network className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-accent tracking-wider uppercase">100% Exact Match</span>
        </div>
      </div>

      {/* Bank Txn */}
      <div className="bg-bg-surface p-4 rounded-xl border border-accent/40 shadow-md shadow-accent/5 flex items-center justify-between transform translate-x-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-warning-subtle flex items-center justify-center">
            <span className="text-[10px] font-bold text-warning">Tx</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">NEFT-RTGS-SteelCorp</div>
            <div className="text-xs text-text-disabled">15 May 2026</div>
          </div>
        </div>
        <div className="text-sm font-mono font-bold text-text-primary">- ₹29,500</div>
      </div>
    </div>
  );
}
