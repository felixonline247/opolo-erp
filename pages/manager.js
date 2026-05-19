import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import StaffChat from '../components/StaffChat' 

export default function ManagerDashboard() {
  const [loading, setLoading] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false) 
  const [userProfile, setUserProfile] = useState({ name: '', email: '', id: null, role: '' })
  const [stats, setStats] = useState({ 
    gross: 0, 
    commissions: 0, 
    remittance: 0, 
    netProfit: 0,
    count: 0 
  })
  const [filterMode, setFilterMode] = useState('total') 
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0])
  const router = useRouter()

  useEffect(() => {
    checkAccess()
  }, [])

  useEffect(() => {
    fetchGlobalStats()
  }, [filterMode, customDate])

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role !== 'Manager' && profile?.role !== 'Admin') {
        alert("Access Denied: Management Privileges Required")
        router.push('/dashboard')
      } else {
        setUserProfile({
          name: profile.full_name,
          email: profile.email || session.user.email,
          id: profile.id,
          role: profile.role
        })
        setLoading(false)
      }
    } catch (err) {
      console.error("Access Error:", err)
      router.push('/')
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
        .select(`amount_paid, institution_cost, staff_commission, commission_earned, status, created_at`)
        // FIX: Match verified income statuses perfectly with accounts portal
        .in('status', ['Awaiting Service', 'Started', 'Completed'])
        .eq('is_deleted', false)

      const now = new Date()
      let start = null
      let end = null

      // FIX: Align calendar time boundaries with accounts dashboard bounds
      if (filterMode === 'today') {
        start = new Date()
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'weekly') {
        start = new Date()
        const currentDay = now.getDay()
        start.setDate(now.getDate() - currentDay) // Align to start of current calendar week (Sunday)
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'monthly') {
        start = new Date(now.getFullYear(), now.getMonth(), 1) // Align to 1st day of current month
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'custom' && customDate) {
        start = new Date(customDate)
        start.setHours(0, 0, 0, 0)
        end = new Date(customDate)
        end.setHours(23, 59, 59, 999)
      }

      if (start && filterMode !== 'total') {
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      let totals = { gross: 0, commissions: 0, remittance: 0, net: 0 }
      data?.forEach(item => {
        const paid = Number(item.amount_paid) || 0
        const inst = Number(item.institution_cost) || 0
        const comm = Number(item.commission_earned || item.staff_commission || 0)
        
        totals.gross += paid
        totals.remittance += inst
        totals.commissions += comm
        totals.net += (paid - inst) // FIX: Aligned with standard Net Resort profit definition (Gross - Institution Cost)
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
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12 relative overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter leading-none">Command Center</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Opolo CBT Resort • Manager Portal</p>
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
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">Staff Commissions</p>
            <h2 className="text-3xl font-black text-blue-600">₦{stats.commissions.toLocaleString()}</h2>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3">Institution Costs</p>
            <h2 className="text-3xl font-black text-red-600">₦{stats.remittance.toLocaleString()}</h2>
          </div>

          <div className="bg-blue-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
            <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mb-3">Net Resort Profit</p>
            <h2 className="text-3xl font-black text-blue-400">₦{stats.netProfit.toLocaleString()}</h2>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-900 rounded-full opacity-20"></div>
          </div>
        </div>

        {/* Administrative Tools */}
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 ml-2">Administrative Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
          
          <Link href="/manager-wallets" className="group">
            <div className="bg-blue-900 p-8 rounded-[2.5rem] border border-blue-800 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-blue-800 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white group-hover:text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <h4 className="text-xl font-black text-white">Wallet Control</h4>
              <p className="text-blue-200 text-sm mt-2 font-medium">Add daily float cash to staff and reset balances.</p>
            </div>
          </Link>

          <Link href="/reports" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-900 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-900 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Financial Reports</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Export CSV data and analyze performance.</p>
            </div>
          </Link>

          <Link href="/pending-jobs" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-amber-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Pending Jobs</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Manage queue and cancel jobs for student refunds.</p>
            </div>
          </Link>

          <Link href="/logs" className="group">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-red-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h4 className="text-xl font-black text-slate-800">Audit Logs</h4>
              <p className="text-slate-400 text-sm mt-2 font-medium">Monitor real-time staff activity and transaction history.</p>
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

      {/* Toggle Button */}
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`fixed bottom-8 right-8 z-[70] flex items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all duration-300 ${
          isChatOpen ? 'bg-red-500 rotate-90' : 'bg-blue-950 hover:scale-110'
        }`}
      >
        {isChatOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white"></span>
            </span>
          </div>
        )}
      </button>

      {/* Backdrop */}
      {isChatOpen && (
        <div 
          className="fixed inset-0 bg-blue-950/40 backdrop-blur-sm z-[50] transition-opacity"
          onClick={() => setIsChatOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`fixed top-0 right-0 h-full w-full md:w-[450px] bg-white z-[60] shadow-2xl transition-transform duration-500 ease-in-out transform ${
        isChatOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="h-full flex flex-col pt-8">
          <div className="px-8 flex justify-between items-center mb-6">
             <h2 className="text-[11px] font-black text-blue-950 uppercase tracking-[0.2em]">Management Comms</h2>
             <button onClick={() => setIsChatOpen(false)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest">Hide Chat</button>
          </div>
          <div className="flex-1 overflow-hidden">
             <StaffChat currentUser={userProfile} />
          </div>
        </div>
      </aside>
    </div>
  )
}