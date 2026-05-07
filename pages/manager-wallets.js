import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { logActivity } from '../lib/logger'

export default function ManagerWalletControl() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [amountInput, setAmountInput] = useState({}) // Stores input per staff row
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    fetchStaffBalances()
  }, [])

  const fetchStaffBalances = async () => {
    setLoading(true)
    // Fetch only service staff profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, current_wallet_balance, role')
      .order('full_name', { ascending: true })
    
    if (!error) setStaffList(data)
    setLoading(false)
  }

  const handleWalletAction = async (staff, type) => {
    const amount = Number(amountInput[staff.id] || 0)
    
    if (type === 'Top-up' && (amount <= 0 || isNaN(amount))) {
      return alert("Please enter a valid amount to top up.")
    }

    if (!confirm(`${type} ₦${type === 'Reset' ? staff.current_wallet_balance : amount} for ${staff.full_name}?`)) return
    
    setProcessingId(staff.id)
    const { data: { session } } = await supabase.auth.getSession()

    try {
      // 1. Record the transaction in the history table
      const { error: txError } = await supabase.from('wallet_transactions').insert({
        staff_id: staff.id,
        supervisor_id: session.user.id,
        amount: type === 'Reset' ? staff.current_wallet_balance : amount,
        transaction_type: type
      })
      if (txError) throw txError

      // 2. Update the Profile balance
      let newBalance = type === 'Reset' ? 0 : (staff.current_wallet_balance || 0) + amount
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_wallet_balance: newBalance })
        .eq('id', staff.id)
      
      if (profileError) throw profileError

      // 3. Log the activity
      await logActivity("Wallet Control", `${type} performed for ${staff.full_name} by Manager`)

      alert(`${type} successful!`)
      setAmountInput({ ...amountInput, [staff.id]: '' }) // Clear input
      fetchStaffBalances() // Refresh list
    } catch (err) {
      alert("Error: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter">Wallet Control</h1>
            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-2">Manage Staff Daily Institution Float</p>
          </div>
          <button onClick={fetchStaffBalances} className="bg-white border p-3 rounded-xl hover:bg-slate-100 transition-all">
            🔄 Refresh
          </button>
        </header>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white">
              <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="p-7">Staff Member</th>
                <th className="p-7">Current Balance</th>
                <th className="p-7">Amount (₦)</th>
                <th className="p-7 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="4" className="p-20 text-center animate-pulse font-black text-slate-300">Loading Balances...</td></tr>
              ) : staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="p-7">
                    <p className="font-black text-blue-950 uppercase text-sm">{staff.full_name}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">{staff.role} • {staff.email}</p>
                  </td>
                  <td className="p-7">
                    <div className={`inline-block px-4 py-2 rounded-2xl font-black text-lg ${staff.current_wallet_balance < 2000 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      ₦{Number(staff.current_wallet_balance || 0).toLocaleString()}
                    </div>
                    {staff.current_wallet_balance < 2000 && (
                        <p className="text-[8px] font-black text-red-500 mt-1 uppercase tracking-tighter">Needs Top-up</p>
                    )}
                  </td>
                  <td className="p-7">
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={amountInput[staff.id] || ''}
                      onChange={(e) => setAmountInput({...amountInput, [staff.id]: e.target.value})}
                      className="bg-slate-100 border-none rounded-xl p-3 font-black text-blue-950 w-32 focus:ring-2 ring-blue-500 outline-none"
                    />
                  </td>
                  <td className="p-7 text-right space-x-2">
                    <button 
                      onClick={() => handleWalletAction(staff, 'Top-up')}
                      disabled={processingId === staff.id}
                      className="bg-blue-950 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-800 transition-all disabled:opacity-50"
                    >
                      Add Cash
                    </button>
                    <button 
                      onClick={() => handleWalletAction(staff, 'Reset')}
                      disabled={processingId === staff.id}
                      className="bg-slate-200 text-slate-600 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 bg-blue-50 p-6 rounded-3xl border border-blue-100 italic">
          <p className="text-[10px] text-blue-800 font-bold uppercase tracking-widest">
            💡 Tip: Use "Reset" at the end of the day after the staff has returned the surplus cash. Use "Add Cash" every morning to set their daily float.
          </p>
        </div>
      </div>
    </div>
  )
}