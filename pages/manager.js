import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function ManagerDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ 
    gross: 0, 
    commissions: 0, 
    remittance: 0, 
    netProfit: 0,
    count: 0 
  })
  const [filterMode, setFilterMode] = useState('total') // 'today', 'weekly', 'monthly', 'total', 'custom'
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0])
  const router = useRouter()

  useEffect(() => {
    checkAccess()
  }, [])

  useEffect(() => {
    fetchGlobalStats()
  }, [filterMode, customDate])

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    // Access restricted to Manager or Admin
    if (profile?.role !== 'Manager' && profile?.role !== 'Admin') {
      alert("Access Denied: Management Privileges Required")
      router.push('/dashboard')
    } else {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const fetchGlobalStats = async () => {
    try {
      let query = supabase
        .from('students')
        .select(`
          amount_paid, 
          institution_cost, 
          staff_commission,
          status,
          completed_at,
          created_at
        `)
        .or('status.eq.Paid,status.eq.Completed,status.eq.Pending')

      const now = new Date()
      if (filterMode === 'today') {
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('created_at', `${today}T00:00:00`)
      } else if (filterMode === 'weekly') {
        const lastWeek = new Date(new Date().setDate(now.getDate() - 7)).toISOString()
        query = query.gte('created_at', lastWeek)
      } else if (filterMode === 'monthly') {
        const lastMonth = new Date(new Date().setMonth(now.getMonth() - 1)).toISOString()
        query = query.gte('created_at', lastMonth)
      } else if (filterMode === 'custom') {
        query = query.gte('created_at', `${customDate}T00:00:00`)
                     .lte('created_at', `${customDate}T23:59:59`)
      }

      const { data, error } = await query
      if (error) throw error

      let totals = { gross: 0, commissions: 0, remittance: 0, net: 0 }

      data?.forEach(item => {
        const paid = Number(item.amount_paid) || 0
        const inst = Number(item.institution_cost) || 0
        const comm = Number(item.staff_commission) || 0

        totals.gross += paid
        totals.remittance += inst
        totals.commissions += comm
        totals.net += (paid - inst - comm)
      })

      setStats({
        gross: totals.gross,
        commissions: totals.commissions,
        remittance: totals.remittance,
        netProfit: totals.net,
        count: data?.length || 0
      })
    } catch (err) {
      console.error("Manager Stats Error:", err.message)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Loading Command Center...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter leading-none">Command Center</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Opolo CBT Resort • Administrative Overview</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm mr-2">
              {['today', 'weekly', 'monthly', 'total', 'custom'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${filterMode === mode ? 'bg-blue-900 text-white shadow-lg' : 'text-slate-400 hover:text-blue-900'}`}
                >
                  {mode}
                </button>
              ))}
              {filterMode === 'custom' && (
                <input 
                  type="date" 
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="ml-2 bg-slate-50 border-none rounded-lg px-2 py-1 text-[10px] font-bold outline-none ring-1 ring-slate-200"
                />
              )}
            </div>

            <button 
              onClick={handleLogout}
              className="bg-white border-2 border-red-100 text-red-500 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Financial Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Gross Revenue</p>
            <h2 className="text-3xl font-black text-blue-950">₦{stats.gross.toLocaleString()}</h2>
            <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Total intake (no deductions)</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Staff Commissions</p>
            <h2 className="text-3xl font-black text-blue-600">₦{stats.commissions.toLocaleString()}</h2>
            <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Payable to processing team</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3">Institution Costs</p>
            <h2 className="text-3xl font-black text-red-600">₦{stats.remittance.toLocaleString()}</h2>
            <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Remittance (e.g. JAMB fees)</p>
          </div>

          <div className="bg-blue-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
            <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mb-3">Net Resort Profit</p>
            <h2 className="text-3xl font-black text-blue-400">₦{stats.netProfit.toLocaleString()}</h2>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-900 rounded-full opacity-20"></div>
          </div>
        </div>

        {/* Administrative Tools */}
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 ml-2">Administrative Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Link href="/reports" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-900 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Financial Reports</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Export CSV data and analyze performance for the 2026 JAMB cycle.</p>
            </div>
          </Link>

          {/* NEW TOOL: Pending Job Control */}
          <Link href="/pending-jobs" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-amber-200 transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-amber-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Pending Jobs</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Manage the queue: cancel or delete paid jobs for student refunds.</p>
            </div>
          </Link>

          <Link href="/logs" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-red-200 transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-red-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Audit Logs</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Monitor real-time staff activity, logins, and transaction history.</p>
            </div>
          </Link>

          <Link href="/settings" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-yellow-200 transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-yellow-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-yellow-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">System Settings</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Configure JAMB prices, service fees, and staff commissions.</p>
            </div>
          </Link>
        </div>

        {/* Transaction Volume Summary */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-blue-950 uppercase text-xs tracking-widest">Transaction Volume</h3>
            <span className="bg-blue-50 px-4 py-1 rounded-full text-[10px] font-black text-blue-900 uppercase">
              {stats.count} Registrations Processed
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div 
               className="h-full bg-blue-900 rounded-full transition-all duration-1000" 
               style={{ width: stats.count > 0 ? '100%' : '0%' }}
            ></div>
          </div>
        </div>

      </div>
    </div>
  )
}