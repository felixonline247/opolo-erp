import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logActivity } from '../lib/logger'

export default function ManagerWalletControl() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [amountInput, setAmountInput] = useState({}) // Stores input per staff row
  const [processingId, setProcessingId] = useState(null)
  
  // Filtering system state variables
  const [filterType, setFilterType] = useState('all') // 'all', 'today', 'week', 'month', 'custom'
  const [customDate, setCustomDate] = useState('')
  const [totalsMap, setTotalsMap] = useState({}) // Maps staff_id -> total top-ups calculated

  useEffect(() => {
    fetchStaffBalances()
  }, [filterType, customDate])

  // Generates PostgreSQL timestamps corresponding to our timeframe toggle state
  const getDateBounds = () => {
    const now = new Date()
    let gteDate = null

    if (filterType === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      gteDate = today.toISOString()
    } else if (filterType === 'week') {
      const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()))
      firstDayOfWeek.setHours(0,0,0,0)
      gteDate = firstDayOfWeek.toISOString()
    } else if (filterType === 'month') {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      gteDate = firstDayOfMonth.toISOString()
    } else if (filterType === 'custom' && customDate) {
      gteDate = `${customDate}T00:00:00Z`
    }

    return gteDate
  }

  const fetchStaffBalances = async () => {
    setLoading(true)
    try {
      // 1. Fetch profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, current_wallet_balance, role')
        .order('full_name', { ascending: true })

      if (profileError) throw profileError

      // 2. Fetch transaction logs dynamically to aggregate total top-ups within the timeframe
      let txQuery = supabase
        .from('wallet_transactions')
        .select('staff_id, amount')
        .eq('transaction_type', 'Top-up')

      const startDateBound = getDateBounds()
      if (startDateBound) {
        txQuery = txQuery.gte('created_at', startDateBound)
        
        // If it's a specific custom single day filter, cap the upper bound to midnight
        if (filterType === 'custom' && customDate) {
          txQuery = txQuery.lte('created_at', `${customDate}T23:59:59Z`)
        }
      }

      const { data: transactions, error: txError } = await txQuery
      if (txError) throw txError

      // Calculate total cash injections added per staff profile
      const mapping = {}
      profiles.forEach(p => mapping[p.id] = 0)
      
      transactions?.forEach(tx => {
        if (mapping[tx.staff_id] !== undefined) {
          mapping[tx.staff_id] += Number(tx.amount || 0)
        }
      })

      setTotalsMap(mapping)
      setStaffList(profiles)
    } catch (err) {
      console.error("Error building wallet calculations:", err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleWalletAction = async (staff, type) => {
    const amount = Number(amountInput[staff.id] || 0)
    
    if (type === 'Top-up' && (amount <= 0 || isNaN(amount))) {
      return alert("Please enter a valid amount to top up.")
    }

    if (!confirm(`${type} ₦${type === 'Reset' ? staff.current_wallet_balance : amount} for ${staff.full_name}?`)) return
    
    setProcessingId(staff.id)

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error("No active authorization session found.")

      // 1. Record the action inside history log tracking
      const { error: txError } = await supabase.from('wallet_transactions').insert({
        staff_id: staff.id,
        supervisor_id: session.user.id,
        amount: type === 'Reset' ? staff.current_wallet_balance : amount,
        transaction_type: type
      })
      if (txError) throw txError

      // 2. Compute new targeted balance
      let newBalance = type === 'Reset' ? 0 : (staff.current_wallet_balance || 0) + amount
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_wallet_balance: newBalance })
        .eq('id', staff.id)
      
      if (profileError) throw profileError

      // 3. Write event tracking log out to systemic logs
      await logActivity("Wallet Control", `${type} performed for ${staff.full_name} by Manager`)

      alert(`${type} processed successfully!`)
      setAmountInput({ ...amountInput, [staff.id]: '' }) 
      fetchStaffBalances() 
    } catch (err) {
      alert("Execution Error: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 text-blue-950 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Block UI */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-blue-950 uppercase tracking-tighter italic">Wallet Control</h1>
            <p className="text-blue-500 font-black text-xs uppercase tracking-widest mt-1">Manage Staff Daily Institution Float</p>
          </div>

          {/* Filtering Layout Control */}
          <div className="flex flex-wrap items-center gap-4 bg-white p-4 border-4 border-blue-950 rounded-[1.5rem] shadow-[4px_4px_0px_0px_rgba(26,54,93,1)]">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-blue-950">Injections Timeframe</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-100 font-black text-xs uppercase tracking-wider text-blue-950 border-2 border-blue-950 p-2.5 rounded-xl focus:outline-none"
              >
                <option value="all">All-Time Totals</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="custom">Specific Date Range</option>
              </select>
            </div>

            {filterType === 'custom' && (
              <div className="flex flex-col gap-1 animate-fadeIn">
                <label className="text-[10px] font-black uppercase tracking-widest text-blue-950">Pick Target Date</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-100 font-black text-xs text-blue-950 border-2 border-blue-950 p-2 rounded-xl focus:outline-none"
                />
              </div>
            )}

            <button 
              onClick={fetchStaffBalances} 
              className="self-end px-4 py-2 bg-blue-500 text-white border-4 border-blue-950 rounded-xl font-black uppercase text-xs tracking-widest shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            >
              🔄 Sync
            </button>
          </div>
        </div>

        {/* Master Ledger Grid Container */}
        <div className="bg-white rounded-[2.5rem] border-4 border-blue-950 overflow-hidden shadow-[8px_8px_0px_0px_rgba(26,54,93,1)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-blue-950 text-white border-b-4 border-blue-950">
                  <th className="p-6 text-xs font-black uppercase tracking-widest">Staff Member</th>
                  <th className="p-6 text-xs font-black uppercase tracking-widest">Current Balance</th>
                  <th className="p-6 text-xs font-black uppercase tracking-widest text-center">Total Added ({filterType})</th>
                  <th className="p-6 text-xs font-black uppercase tracking-widest">Inflow Input</th>
                  <th className="p-6 text-xs font-black uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="p-24 text-center font-black uppercase tracking-widest text-blue-500 animate-pulse">
                      Calculating ledger values and balances...
                    </td>
                  </tr>
                ) : staffList.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-16 text-center font-black uppercase text-slate-400">
                      No matching profile structures found.
                    </td>
                  </tr>
                ) : staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6">
                      <p className="font-black text-blue-950 uppercase text-base tracking-tight">{staff.full_name}</p>
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5">{staff.role} • <span className="text-slate-400 normal-case font-bold">{staff.email}</span></p>
                    </td>
                    
                    <td className="p-6">
                      <div className={`inline-block px-4 py-2 border-2 border-blue-950 rounded-xl font-black text-base shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] ${staff.current_wallet_balance < 2000 ? 'bg-red-400 text-white' : 'bg-green-400 text-white'}`}>
                        ₦{Number(staff.current_wallet_balance || 0).toLocaleString('en-NG')}
                      </div>
                      {staff.current_wallet_balance < 2000 && (
                        <p className="text-[9px] font-black text-red-600 mt-1.5 uppercase tracking-widest animate-pulse">⚠️ Float Deficit</p>
                      )}
                    </td>

                    <td className="p-6 text-center">
                      <div className="inline-block px-4 py-1.5 bg-slate-100 border-2 border-blue-950 rounded-xl font-black text-sm text-blue-950">
                        ₦{Number(totalsMap[staff.id] || 0).toLocaleString('en-NG')}
                      </div>
                    </td>

                    <td className="p-6">
                      <div className="relative flex items-center">
                        <span className="absolute left-3 font-black text-sm text-blue-950">₦</span>
                        <input 
                          type="number" 
                          placeholder="0.00"
                          value={amountInput[staff.id] || ''}
                          onChange={(e) => setAmountInput({...amountInput, [staff.id]: e.target.value})}
                          className="pl-7 pr-3 py-2.5 bg-white border-2 border-blue-950 rounded-xl font-black text-sm text-blue-950 w-32 focus:outline-none focus:bg-slate-50"
                        />
                      </div>
                    </td>

                    <td className="p-6 text-right space-x-3">
                      <button 
                        onClick={() => handleWalletAction(staff, 'Top-up')}
                        disabled={processingId === staff.id}
                        className="bg-green-500 text-white border-2 border-blue-950 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(26,54,93,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] transition-all disabled:opacity-50"
                      >
                        Add Cash
                      </button>
                      <button 
                        onClick={() => handleWalletAction(staff, 'Reset')}
                        disabled={processingId === staff.id}
                        className="bg-slate-100 text-slate-700 border-2 border-blue-950 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(26,54,93,1)] hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Warning Indicator Bottom Hint */}
        <div className="mt-8 bg-amber-50 p-6 rounded-[1.5rem] border-4 border-blue-950 shadow-[4px_4px_0px_0px_rgba(26,54,93,1)]">
          <p className="text-[11px] text-blue-950 font-black uppercase tracking-wider leading-relaxed">
            💡 Operational Tip: Use "Reset" at the end of business hours after cash reconciliation. Use "Add Cash" every morning to establish each officer's registration platform entry float.
          </p>
        </div>
      </div>
    </div>
  )
}