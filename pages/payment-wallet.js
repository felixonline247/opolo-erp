import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PaymentWallet() {
  const [balance, setBalance] = useState(0)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [staffName, setStaffName] = useState('')

  useEffect(() => {
    fetchWalletData()
  }, [])

  const fetchWalletData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // 1. Get Current Balance from Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, current_wallet_balance')
        .eq('id', session.user.id)
        .single()

      setBalance(profile?.current_wallet_balance || 0)
      setStaffName(profile?.full_name)

      // 2. Fetch today's spending from 'students' table
      const today = new Date().toISOString().split('T')[0]
      const { data: jobs } = await supabase
        .from('students')
        .select('full_name, institution_cost, completed_at, services(service_name)')
        .eq('completed_by', session.user.id)
        .eq('status', 'Completed')
        .gte('completed_at', `${today}T00:00:00`)
        .order('completed_at', { ascending: false })

      setHistory(jobs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* ALERT: LOW BALANCE */}
        {balance > 0 && balance < 2000 && (
          <div className="bg-red-600 text-white p-6 rounded-[2rem] mb-6 shadow-xl shadow-red-200 animate-pulse">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">System Alert</p>
            <h2 className="text-xl font-black">CRITICAL: Wallet balance is ₦{balance.toLocaleString()}. Request top-up!</h2>
          </div>
        )}

        <div className="bg-blue-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden mb-8">
          <p className="text-[10px] font-black uppercase opacity-60 tracking-[0.3em] mb-2">Available Cash Float</p>
          <h1 className="text-6xl font-black tracking-tighter italic">₦{balance.toLocaleString()}</h1>
          <p className="mt-4 text-[11px] font-bold opacity-80 uppercase tracking-widest italic">{staffName}</p>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
             <h3 className="text-[11px] font-black text-blue-950 uppercase tracking-widest">Today's Expenditure</h3>
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Institution Costs</span>
          </div>

          <div className="divide-y divide-slate-50">
            {history.map((job, i) => (
              <div key={i} className="p-8 flex justify-between items-center hover:bg-slate-50/50 transition-all">
                <div>
                  <p className="font-black text-blue-950 uppercase text-sm">{job.full_name}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{job.services?.service_name}</p>
                </div>
                <p className="font-black text-red-500 text-lg tracking-tighter">-₦{Number(job.institution_cost).toLocaleString()}</p>
              </div>
            ))}

            {history.length === 0 && (
              <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No transactions recorded today</div>
            )}
          </div>
        </div>

        <div className="mt-10 p-8 bg-green-50 rounded-[2.5rem] border border-green-100 text-center">
          <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1">Closing Surplus</p>
          <p className="text-2xl font-black text-blue-950 tracking-tighter">₦{balance.toLocaleString()}</p>
          <p className="text-[9px] font-bold text-green-600 uppercase mt-2">To be returned to Accountant at end of shift</p>
        </div>
      </div>
    </div>
  )
}