import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import { logActivity } from '../lib/logger' 

export default function CommissionReport() {
  const [report, setReport] = useState([])
  const [totalPayout, setTotalPayout] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const router = useRouter()
  
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    checkManagerAccess()
    fetchCommissionData()
  }, [startDate, endDate])

  const checkManagerAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    const allowed = ['Manager', 'Admin', 'Account', 'Supervisor'];
    if (!allowed.includes(profile?.role)) router.push('/dashboard')
  }

  const setRange = (type) => {
    const now = new Date();
    let start = new Date();
    if (type === 'day') start = new Date(now.setHours(0,0,0,0));
    if (type === 'week') start.setDate(now.getDate() - 7);
    if (type === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
  }

  const fetchCommissionData = async () => {
    setLoading(true)
    try {
      // UPDATED: Now fetching from 'students' table to match service.js logic
      const { data: jobs, error: jobsError } = await supabase
        .from('students')
        .select(`
          staff_commission, 
          completed_by, 
          completed_at,
          is_payout_completed,
          full_name
        `)
        .eq('status', 'Completed') // Changed to match capital 'C' from service.js
        .eq('is_payout_completed', false) 
        .gte('completed_at', `${startDate}T00:00:00`)
        .lte('completed_at', `${endDate}T23:59:59`)

      if (jobsError) throw jobsError

      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, commission_value')

      const profileMap = {}
      profiles?.forEach(p => { profileMap[p.id] = p })

      const grouped = jobs.reduce((acc, curr) => {
        const staffId = curr.completed_by // Changed from assigned_staff_id
        if (!staffId || !profileMap[staffId]) return acc
        
        if (!acc[staffId]) {
          acc[staffId] = { 
            id: staffId,
            name: profileMap[staffId].full_name, 
            email: profileMap[staffId].email, 
            wallet_balance: profileMap[staffId].commission_value || 0,
            jobs: 0, 
            total_unpaid: 0 
          }
        }
        acc[staffId].jobs += 1
        acc[staffId].total_unpaid += Number(curr.staff_commission || 0) // Changed from actual_commission
        return acc
      }, {})

      const reportArray = Object.values(grouped)
      setReport(reportArray)
      setTotalPayout(reportArray.reduce((sum, item) => sum + item.total_unpaid, 0))
      
    } catch (err) {
      console.error("Report error:", err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePayout = async (staff) => {
    if (!confirm(`Mark ₦${staff.total_unpaid.toLocaleString()} as paid to ${staff.name}?`)) return
    setProcessingId(staff.id)

    try {
      // 1. Update Profile (Subtract from their commission balance if you track it there)
      const newBalance = Math.max(0, staff.wallet_balance - staff.total_unpaid)
      await supabase.from('profiles').update({ commission_value: newBalance }).eq('id', staff.id)

      // 2. Mark all jobs in this range for this staff as paid in the 'students' table
      const { error: updateError } = await supabase.from('students')
        .update({ is_payout_completed: true })
        .eq('completed_by', staff.id)
        .eq('status', 'Completed')
        .gte('completed_at', `${startDate}T00:00:00`)
        .lte('completed_at', `${endDate}T23:59:59`)

      if (updateError) throw updateError

      // 3. Log Activity
      await logActivity("Payout", `Paid ₦${staff.total_unpaid.toLocaleString()} commission to ${staff.name}`)
      
      alert("Payment processed and records updated.")
      fetchCommissionData()
    } catch (err) {
      alert("Payout failed: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Staff Payouts</h1>
            <div className="flex gap-2 mt-2">
              {['day', 'week', 'month'].map(t => (
                <button key={t} onClick={() => setRange(t)} className="text-[9px] font-black bg-white border px-4 py-1.5 rounded-full hover:bg-blue-900 hover:text-white uppercase transition-all tracking-widest">
                  This {t}
                </button>
              ))}
              <Link href="/manager" className="text-[9px] font-black bg-slate-200 text-slate-600 border px-4 py-1.5 rounded-full hover:bg-slate-300 uppercase transition-all tracking-widest">
                Dashboard
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-[10px] font-bold outline-none px-2 uppercase" />
            <span className="text-slate-300 font-bold">→</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-[10px] font-bold outline-none px-2 uppercase" />
            <button onClick={fetchCommissionData} className="bg-blue-900 text-white px-5 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-800">Filter</button>
          </div>
        </div>

        <div className="bg-blue-900 rounded-[2.5rem] p-10 mb-8 text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase opacity-60 tracking-[0.2em] mb-2">Total Unpaid Commission</p>
            <h2 className="text-6xl font-black tracking-tighter italic">₦{totalPayout.toLocaleString()}</h2>
          </div>
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900 text-white">
              <tr className="text-[10px] font-black uppercase tracking-widest">
                <th className="p-7">Staff Member</th>
                <th className="p-7 text-center">Unpaid Jobs</th>
                <th className="p-7 text-right">Commission Due</th>
                <th className="p-7 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="4" className="p-20 text-center font-black text-slate-300 uppercase tracking-widest animate-pulse">Syncing Records...</td></tr>
              ) : report.length === 0 ? (
                <tr><td colSpan="4" className="p-20 text-center font-bold text-slate-400 italic">No pending payouts found for this period.</td></tr>
              ) : report.map((staff) => (
                <tr key={staff.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-7">
                    <p className="font-black text-blue-950 text-sm uppercase tracking-tight">{staff.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{staff.email}</p>
                  </td>
                  <td className="p-7 text-center">
                    <span className="font-black text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full text-[10px] uppercase">{staff.jobs} Jobs</span>
                  </td>
                  <td className="p-7 text-right font-black text-2xl text-blue-950 tracking-tighter">₦{staff.total_unpaid.toLocaleString()}</td>
                  <td className="p-7 text-right">
                    <button 
                      onClick={() => handlePayout(staff)}
                      disabled={processingId === staff.id}
                      className="bg-green-500 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-green-100 disabled:bg-slate-200 disabled:shadow-none"
                    >
                      {processingId === staff.id ? 'Processing...' : 'Mark as Paid'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}