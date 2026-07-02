import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import { logActivity } from '../lib/logger' 

export default function CommissionReport() {
  const [report, setReport] = useState([])
  const [supervisorReport, setSupervisorReport] = useState([]) // 🚀 Independent Supervisor State Ledger
  const [paymentHistory, setPaymentHistory] = useState([]) 
  const [activeTab, setActiveTab] = useState('unpaid') 
  const [totalPayout, setTotalPayout] = useState(0)
  const [totalSupervisorPayout, setTotalSupervisorPayout] = useState(0) // 🚀 Summary Card Metrics Tracker
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const router = useRouter()
  
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    checkManagerAccess()
    fetchCommissionData()
  }, [startDate, endDate, activeTab])

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
      // 1. Fetch Dynamic Global Settings Percentage Override
      const { data: globalSettings } = await supabase
        .from('settings')
        .select('supervisor_percentage')
        .eq('id', 1)
        .single()

      const calculatedRate = globalSettings?.supervisor_percentage 
        ? Number(globalSettings.supervisor_percentage) / 100 
        : 0.025 // Standard 2.5% fallback baseline rate

      if (activeTab === 'unpaid') {
        const { data: jobs, error: jobsError } = await supabase
          .from('students')
          .select(`
            staff_commission, 
            completed_by, 
            completed_at,
            is_payout_completed,
            is_supervisor_payout_completed,
            full_name,
            amount_paid,
            institution_cost
          `)
          .eq('status', 'Completed') 
          .gte('completed_at', `${startDate}T00:00:00`)
          .lte('completed_at', `${endDate}T23:59:59`)

        if (jobsError) throw jobsError

        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, role')

        const profileMap = {}
        const supervisorProfilesArray = []
        
        profiles?.forEach(p => { 
          profileMap[p.id] = p 
          if (p.role === 'Supervisor') {
            supervisorProfilesArray.push(p)
          }
        })

        // Pure Staff Loop
        const staffGrouped = jobs.reduce((acc, curr) => {
          if (curr.is_payout_completed) return acc
          const staffId = curr.completed_by 
          if (!staffId || !profileMap[staffId]) return acc
          
          if (!acc[staffId]) {
            acc[staffId] = { 
              id: staffId,
              name: profileMap[staffId].full_name, 
              email: profileMap[staffId].email, 
              jobs: 0, 
              total_unpaid: 0 
            }
          }
          acc[staffId].jobs += 1
          acc[staffId].total_unpaid += Number(curr.staff_commission || 0) 
          return acc
        }, {})

        // 2. Group all completed jobs by calendar day to enforce the Version 3.0 Daily Cap Rule
        const completedJobsByDay = {}
        jobs.forEach(curr => {
          if (curr.is_supervisor_payout_completed) return
          if (!curr.completed_at) return
          const day = curr.completed_at.split('T')[0]
          if (!completedJobsByDay[day]) {
            completedJobsByDay[day] = []
          }
          completedJobsByDay[day].push(curr)
        })

        // 3. Compute Supervisor Cuts sequentially day-by-day
        let totalCompanySupervisorUnpaidPool = 0
        let aggregateSupervisedJobsCount = 0

        Object.keys(completedJobsByDay).forEach(day => {
          // Sort tasks chronologically from oldest to newest
          completedJobsByDay[day].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at))
          
          let dailyRunningCut = 0
          completedJobsByDay[day].forEach(curr => {
            const paid = Number(curr.amount_paid || 0)
            const inst = Number(curr.institution_cost || 0)
            const staffComm = Number(curr.staff_commission || 0)
            
            // MATH RULE 1 UPDATE: Net Margin = Amount Paid - Institution Cost - Staff Commission
            const netProfitMargin = paid - inst - staffComm
            
            if (netProfitMargin > 0) {
              let cut = netProfitMargin * calculatedRate
              
              // MATH RULE 2 UPDATE: Enforce rigid global ceiling cap of ₦17,500 daily
              if (dailyRunningCut + cut > 17500) {
                cut = 17500 - dailyRunningCut
              }
              if (cut < 0) cut = 0
              
              dailyRunningCut += cut
              totalCompanySupervisorUnpaidPool += cut
              aggregateSupervisedJobsCount += 1
            }
          })
        })

        // Distribute the company pool uniformly to all active Supervisor accounts on the dashboard
        const supervisorGrouped = {}
        if (totalCompanySupervisorUnpaidPool > 0 && supervisorProfilesArray.length > 0) {
          const sharePerSupervisor = totalCompanySupervisorUnpaidPool / supervisorProfilesArray.length
          
          supervisorProfilesArray.forEach(sup => {
            supervisorGrouped[sup.id] = {
              id: sup.id,
              name: sup.full_name,
              email: sup.email,
              jobs: aggregateSupervisedJobsCount, 
              total_unpaid: sharePerSupervisor
            }
          })
        }

        const staffArray = Object.values(staffGrouped)
        const supervisorArray = Object.values(supervisorGrouped)

        setReport(staffArray)
        setSupervisorReport(supervisorArray)
        setTotalPayout(staffArray.reduce((sum, item) => sum + item.total_unpaid, 0))
        setTotalSupervisorPayout(totalCompanySupervisorUnpaidPool)
      } else {
        // TAB FIX: Selects records where EITHER staff payout OR supervisor payout is marked true
        const { data: pastJobs, error: historyError } = await supabase
          .from('students')
          .select(`
            id,
            full_name,
            staff_commission,
            completed_at,
            amount_paid,
            institution_cost,
            is_payout_completed,
            is_supervisor_payout_completed,
            profiles!students_completed_by_fkey(full_name, email, role),
            services(service_name)
          `)
          .eq('status', 'Completed')
          .or('is_payout_completed.eq.true,is_supervisor_payout_completed.eq.true')
          .gte('completed_at', `${startDate}T00:00:00`)
          .lte('completed_at', `${endDate}T23:59:59`)
          .order('completed_at', { ascending: false })

        if (historyError) throw historyError
        setPaymentHistory(pastJobs || [])
      }
      
    } catch (err) {
      console.error("Report error:", err.message)
    } finally {
      // FIXED: Swapped 'desert' out for the authentic keyword 'finally'
      setLoading(false)
    }
  }

  const handlePayout = async (staff) => {
    if (!confirm(`Mark ₦${staff.total_unpaid.toLocaleString()} as paid to ${staff.name}?`)) return
    setProcessingId(staff.id)

    try {
      const { error: updateError } = await supabase.from('students')
        .update({ is_payout_completed: true })
        .eq('completed_by', staff.id)
        .eq('status', 'Completed')
        .eq('is_payout_completed', false) 
        .gte('completed_at', `${startDate}T00:00:00`)
        .lte('completed_at', `${endDate}T23:59:59`)

      if (updateError) throw updateError

      await logActivity("Payout", `Paid ₦${staff.total_unpaid.toLocaleString()} commission to ${staff.name}`)
      alert("Payment processed securely.")
      fetchCommissionData()
    } catch (err) {
      alert("Payout failed: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleSupervisorPayout = async (sup) => {
    if (!confirm(`Mark supervisor overhead override pool inside this date range as settled and cleared?`)) return
    setProcessingId(`sup-${sup.id}`)

    try {
      const { error: updateError } = await supabase.from('students')
        .update({ is_supervisor_payout_completed: true })
        .eq('status', 'Completed')
        .eq('is_supervisor_payout_completed', false) 
        .gte('completed_at', `${startDate}T00:00:00`)
        .lte('completed_at', `${endDate}T23:59:59`)

      if (updateError) throw updateError

      await logActivity("Supervisor Payout", `Cleared Supervisor Overhead Override pools for active range intervals.`)
      alert("Supervisor Override clear successful across active range parameters!")
      fetchCommissionData()
    } catch (err) {
      alert("Supervisor payout failure: " + err.message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-blue-950">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Financial Ledger</h1>
            <div className="flex gap-2 mt-2">
              {['day', 'week', 'month'].map(t => (
                <button key={t} onClick={() => setRange(t)} className="text-[9px] font-black bg-white border px-4 py-1.5 rounded-full hover:bg-blue-900 hover:text-white uppercase transition-all tracking-widest shadow-sm">
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

        {/* SPLIT ACCOUNTING SUMMARY CONTAINER CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-blue-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
            <p className="text-[10px] font-black uppercase opacity-60 tracking-wider mb-2">Standard Staff Unpaid Due</p>
            <h2 className="text-4xl font-black tracking-tighter italic">₦{totalPayout.toLocaleString()}</h2>
          </div>
          
          <div className="bg-amber-500 rounded-[2rem] p-8 text-blue-950 shadow-xl relative overflow-hidden border-2 border-blue-950 shadow-[4px_4px_0px_0px_rgba(26,54,93,1)]">
            <p className="text-[10px] font-black uppercase opacity-70 tracking-wider mb-2">⚡ Supervisor Dynamic Override Pool (Capped)</p>
            <h2 className="text-4xl font-black tracking-tighter italic">₦{totalSupervisorPayout.toLocaleString()}</h2>
          </div>
        </div>

        <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-4 w-full sm:w-80 shadow-inner">
          <button onClick={() => setActiveTab('unpaid')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'unpaid' ? 'bg-blue-950 text-white shadow-md' : 'text-slate-500 hover:text-blue-950'}`}>⏳ Unpaid Due</button>
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-blue-950 text-white shadow-md' : 'text-slate-500 hover:text-blue-950'}`}>📜 Paid History</button>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 space-y-8 p-2">
          {activeTab === 'unpaid' ? (
            <>
              {/* LEDGER AREA 1: STANDARD STAFF */}
              <div>
                <div className="p-6 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-t-2xl">Standard Staff Commissions Due</div>
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td className="p-10 text-center font-black text-slate-300 uppercase tracking-widest animate-pulse">Syncing...</td></tr>
                    ) : report.length === 0 ? (
                      <tr><td className="p-10 text-center text-slate-400 italic text-xs uppercase">No basic entries found.</td></tr>
                    ) : report.map((staff) => (
                      <tr key={staff.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-7">
                          <p className="font-black text-blue-950 text-sm uppercase">{staff.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{staff.email}</p>
                        </td>
                        <td className="p-7 text-center"><span className="font-black text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full text-[10px] uppercase">{staff.jobs} Jobs</span></td>
                        <td className="p-7 text-right font-black text-xl text-blue-950">₦{staff.total_unpaid.toLocaleString()}</td>
                        <td className="p-7 text-right">
                          <button onClick={() => handlePayout(staff)} disabled={processingId === staff.id} className="bg-green-500 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all">Payout</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* LEDGER AREA 2: SUPERVISORS OVERHEAD MODULE */}
              <div className="mt-8">
                <div className="p-6 bg-amber-500 text-blue-950 font-black text-xs uppercase tracking-widest rounded-t-2xl border-t-2 border-blue-950">Supervisor Management Override Ledger</div>
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td className="p-10 text-center font-black text-slate-300 uppercase tracking-widest animate-pulse">Syncing...</td></tr>
                    ) : supervisorReport.length === 0 ? (
                      <tr><td className="p-10 text-center text-slate-400 italic text-xs uppercase">No supervisor override metrics currently outstanding inside this window.</td></tr>
                    ) : supervisorReport.map((sup) => (
                      <tr key={sup.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-7">
                          <p className="font-black text-blue-950 text-sm uppercase">{sup.name} <span className="text-[9px] bg-blue-950 text-white px-2 py-0.5 rounded ml-2">SUPERVISOR</span></p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">{sup.email}</p>
                        </td>
                        <td className="p-7 text-center"><span className="font-black text-amber-700 bg-amber-50 px-4 py-1.5 rounded-full text-[10px] uppercase">{sup.jobs} Supervised Queue Tasks</span></td>
                        <td className="p-7 text-right table-cell font-black text-xl text-amber-600">₦{sup.total_unpaid.toLocaleString()}</td>
                        <td className="p-7 text-right">
                          <button onClick={() => handleSupervisorPayout(sup)} disabled={processingId === `sup-${sup.id}`} className="bg-blue-950 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-blue-950 transition-all shadow-md">Clear Override</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* HISTORICAL LOG SHEET TAB VIEW */
            <table className="w-full text-left border-collapse">
              <thead className="bg-purple-950 text-white">
                <tr className="text-[10px] font-black uppercase tracking-widest">
                  <th className="p-7">Cleared Student Task</th>
                  <th className="p-7">Handled By</th>
                  <th className="p-7 text-right">Settlement Verification Flags</th>
                  <th className="p-7 text-right">Clearing Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="p-10 text-center font-black text-slate-300 uppercase tracking-widest animate-pulse">Syncing History Ledger...</td></tr>
                ) : paymentHistory.length === 0 ? (
                  <tr><td colSpan="4" className="p-10 text-center text-slate-400 italic text-xs uppercase">No paid history entries found inside this date range.</td></tr>
                ) : paymentHistory.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-7">
                        <p className="font-black text-slate-800 text-sm uppercase">{item.full_name}</p>
                        <p className="text-[9px] text-purple-600 font-bold uppercase">{item.services?.service_name || 'Service Task'}</p>
                      </td>
                      <td className="p-7">
                        <p className="font-black text-blue-950 text-xs uppercase">{item.profiles?.full_name || 'System Operator'}</p>
                        <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">{item.profiles?.role || 'Staff'}</span>
                      </td>
                      <td className="p-7 text-right text-xs font-mono font-bold">
                        <p className={item.is_payout_completed ? "text-green-600 font-black" : "text-slate-400"}>
                          Staff Comm: ₦{Number(item.staff_commission || 0).toLocaleString()} [{item.is_payout_completed ? "PAID" : "UNPAID"}]
                        </p>
                        <p className={item.is_supervisor_payout_completed ? "text-blue-600 font-black" : "text-slate-400"}>
                          Supervisor Share Status: [{item.is_supervisor_payout_completed ? "PAID & SETTLED" : "UNPAID OVERHEAD"}]
                        </p>
                      </td>
                      <td className="p-7 text-right text-xs font-bold text-slate-500 uppercase">
                        {new Date(item.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}