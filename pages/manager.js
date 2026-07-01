import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import StaffChat from '../components/StaffChat' 

export default function ManagerDashboard() {
  const [loading, setLoading] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false) 
  const [userProfile, setUserProfile] = useState({ name: '', email: '', id: null, role: '' })
  
  // SHARED MATRIX: Synchronized perfectly across both manager.js and account.js pages
  const [visibility, setVisibility] = useState({
    showGross: true,
    showCommissions: true,
    showRemittance: true,
    showNet: true,
    showAgent: true,
    showSupervisorCut: true // NEW: Synchronized visibility parameter state
  })

  const [stats, setStats] = useState({ 
    gross: 0, 
    commissions: 0, 
    remittance: 0, 
    netProfit: 0,
    agentGross: 0,
    supervisorCuts: 0, // NEW: Supervisor total statistical state metric
    count: 0 
  })
  
  const [filterMode, setFilterMode] = useState('total') 
  
  // RANGE UPDATE: Two distinct variables tracking starting and ending calendars safely
  const [customStartDate, setCustomStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0])
  
  const router = useRouter()

  // Pulls current active master visibility rules from shared application storage space
  useEffect(() => {
    const cachedVisibility = localStorage.getItem('opolo_master_visibility')
    if (cachedVisibility) {
      try {
        setVisibility(JSON.parse(cachedVisibility))
      } catch (e) {
        console.error("Failed loading master visibility map configurations:", e)
      }
    }
  }, [])

  useEffect(() => {
    checkAccess()
  }, [])

  useEffect(() => {
    if (userProfile.id) {
      fetchGlobalStats()
    }
  }, [filterMode, customStartDate, customEndDate, userProfile.id])

  // SYNC FIX: Saves changes under the exact master key read by account.js
  const toggleVisibilitySetting = (key) => {
    const updatedVisibility = { ...visibility, [key]: !visibility[key] }
    setVisibility(updatedVisibility)
    localStorage.setItem('opolo_master_visibility', JSON.stringify(updatedVisibility))
  }

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
      // 1. Fetch Dynamic Global Settings for Supervisor Cut Percentage Configuration
      const { data: globalSettings } = await supabase
        .from('settings')
        .select('supervisor_percentage')
        .eq('id', 1)
        .single()

      const calculatedRate = globalSettings?.supervisor_percentage 
        ? Number(globalSettings.supervisor_percentage) / 100 
        : 0.025 // 2.5% Fallback Rate

      const now = new Date()
      let start = null
      let end = null

      if (filterMode === 'today') {
        start = new Date()
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'weekly') {
        start = new Date()
        const currentDay = now.getDay()
        start.setDate(now.getDate() - currentDay) 
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'monthly') {
        start = new Date(now.getFullYear(), now.getMonth(), 1) 
        end = new Date()
        end.setHours(23, 59, 59, 999)
      } else if (filterMode === 'custom') {
        start = new Date(customStartDate)
        start.setHours(0, 0, 0, 0)
        end = new Date(customEndDate)
        end.setHours(23, 59, 59, 999)
      }

      let allData = []
      let fromIdx = 0
      let toIdx = 999
      let hasMore = true
      const CHUNK_SIZE = 1000

      while (hasMore) {
        let query = supabase
          .from('students')
          .select(`amount_paid, institution_cost, staff_commission, consultant_commission, commission_earned, status, created_at, completed_at, registration_source, is_supervisor_payout_completed`)
          .in('status', ['Awaiting Service', 'Started', 'Completed'])
          .eq('is_deleted', false)
          .range(fromIdx, toIdx)

        if (start && filterMode !== 'total') {
          query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
        }

        const { data, error } = await query
        if (error) throw error

        if (data && data.length > 0) {
          allData = [...allData, ...data]
          if (data.length < CHUNK_SIZE) {
            hasMore = false
          } else {
            fromIdx += CHUNK_SIZE
            toIdx += CHUNK_SIZE
          }
        } else {
          hasMore = false
        }
      }

      let totals = { gross: 0, commissions: 0, remittance: 0, agent: 0 }
      const completedJobsByDay = {}
      
      allData.forEach(item => {
        const paid = Number(item.amount_paid) || 0
        const inst = Number(item.institution_cost) || 0
        const comm = Number(item.commission_earned || item.staff_commission || 0) + Number(item.consultant_commission || 0)
        
        totals.gross += paid
        totals.remittance += inst
        totals.commissions += comm

        if (item.registration_source === 'Business Center') {
          totals.agent += paid
        }

        // Isolate entries to daily grouping slots for strict supervisor capping calculation loops
        if (item.status === 'Completed' && !item.is_supervisor_payout_completed && item.completed_at) {
          const day = item.completed_at.split('T')[0]
          if (!completedJobsByDay[day]) {
            completedJobsByDay[day] = []
          }
          completedJobsByDay[day].push(item)
        }
      })

      // Run sequential chronological calculation tracking for supervisors across daily intervals
      let totalSupervisorCuts = 0
      Object.keys(completedJobsByDay).forEach(day => {
        // Sort items chronologically from oldest to newest
        completedJobsByDay[day].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at))
        
        let dailyRunningCut = 0
        completedJobsByDay[day].forEach(item => {
          const paid = Number(item.amount_paid || 0)
          const inst = Number(item.institution_cost || 0)
          const staffComm = Number(item.staff_commission || 0)
          
          // MATH RULE 1: Net Margin = Amount Paid - Institution Cost - Staff Commission
          const netProfitMargin = paid - inst - staffComm
          
          if (netProfitMargin > 0) {
            let cut = netProfitMargin * calculatedRate
            
            // MATH RULE 2: Enforce global cap of ₦17,500 daily
            if (dailyRunningCut + cut > 17500) {
              cut = 17500 - dailyRunningCut
            }
            if (cut < 0) cut = 0
            
            dailyRunningCut += cut
            totalSupervisorCuts += cut
          }
        })
      })

      // Deduct everything perfectly to establish matching genuine Net Profit numbers
      const finalNetProfit = totals.gross - totals.remittance - totals.commissions - totalSupervisorCuts

      setStats({
        gross: totals.gross,
        commissions: totals.commissions,
        remittance: totals.remittance,
        netProfit: finalNetProfit,
        agentGross: totals.agent,
        supervisorCuts: totalSupervisorCuts, // Tracked perfectly alongside filter bounds
        count: allData.length
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
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12 relative overflow-x-hidden text-blue-950">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter leading-none">Command Center</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Opolo CBT Resort • Manager Portal</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-2">
              <div className="flex rounded-xl overflow-hidden bg-slate-50 p-1">
                {['today', 'weekly', 'monthly', 'total', 'custom'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${filterMode === mode ? 'bg-blue-900 text-white shadow-md' : 'text-slate-400 hover:text-blue-900'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              
              {/* RANGE IMPLEMENTATION DESIGN BLOCK */}
              {filterMode === 'custom' && (
                <div className="flex items-center gap-2 bg-blue-50/50 p-1.5 rounded-xl border border-blue-100 animate-in slide-in-from-top-2 duration-150">
                  <div className="flex flex-col">
                    <span className="text-[7px] font-black text-blue-400 uppercase px-1">From</span>
                    <input 
                      type="date" 
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold outline-none text-blue-950"
                    />
                  </div>
                  <span className="text-blue-300 font-black text-xs">→</span>
                  <div className="flex flex-col">
                    <span className="text-[7px] font-black text-blue-400 uppercase px-1">To</span>
                    <input 
                      type="date" 
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold outline-none text-blue-950"
                    />
                  </div>
                </div>
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

        {/* METRICS CONTROL SWITCHES PANEL */}
        <div className="mb-8 p-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm flex flex-wrap gap-3 items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Metrics Filter Switches:</span>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => toggleVisibilitySetting('showGross')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showGross ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Gross Rev Card: {visibility.showGross ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => toggleVisibilitySetting('showCommissions')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showCommissions ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Staff Payouts Card: {visibility.showCommissions ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => toggleVisibilitySetting('showRemittance')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showRemittance ? 'bg-red-100 text-red-900 border-red-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Institution Remit Card: {visibility.showRemittance ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => toggleVisibilitySetting('showNet')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showNet ? 'bg-green-100 text-green-900 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Net Profit Card: {visibility.showNet ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => toggleVisibilitySetting('showAgent')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showAgent ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Partner Agents Card: {visibility.showAgent ? 'ON' : 'OFF'}
            </button>
            {/* NEW VISIBILITY INTERFACE CONTROL SWITCH */}
            <button 
              onClick={() => toggleVisibilitySetting('showSupervisorCut')}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showSupervisorCut ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
            >
              Supervisor Cuts Card: {visibility.showSupervisorCut ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-12">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Gross Revenue</p>
            <h2 className="text-2xl font-black text-blue-950">₦{stats.gross.toLocaleString()}</h2>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black text-blue-600 uppercase mb-2 tracking-widest">Staff Commissions</p>
            <h2 className="text-2xl font-black text-blue-600">₦{stats.commissions.toLocaleString()}</h2>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black text-red-500 uppercase mb-2 tracking-widest">Institution Costs</p>
            <h2 className="text-2xl font-black text-red-600">₦{stats.remittance.toLocaleString()}</h2>
          </div>

          {/* BRAND NEW: DYNAMIC LIVE CEILING SUPERVISOR METRIC CONTAINER */}
          <div className="bg-white p-6 rounded-[2rem] border-4 border-amber-500 shadow-sm flex flex-col justify-center transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black text-amber-600 uppercase mb-2 tracking-widest">⚡ Supervisor Cuts</p>
            <h2 className="text-2xl font-black text-amber-600">₦{stats.supervisorCuts.toLocaleString()}</h2>
          </div>

          <div className="bg-purple-900 p-6 rounded-[2rem] text-white shadow-lg transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black uppercase mb-2 tracking-widest opacity-70">Partner Agent Income</p>
            <h2 className="text-2xl font-black">₦{stats.agentGross.toLocaleString()}</h2>
          </div>

          <div className="bg-blue-950 p-6 rounded-[2rem] text-white shadow-2xl relative overflow-hidden transition-all animate-in fade-in zoom-in-95">
            <p className="text-[9px] font-black uppercase opacity-60 tracking-widest mb-2">Net Resort Profit</p>
            <h2 className="text-2xl font-black text-blue-400">₦{stats.netProfit.toLocaleString()}</h2>
            <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-blue-900 rounded-full opacity-20"></div>
          </div>
        </div>

        {/* Administrative Tools Grid */}
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6 ml-2">Administrative Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-12">
          
          <Link href="/manager-wallets" className="group">
            <div className="bg-blue-900 p-6 rounded-[2rem] border border-blue-800 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white group-hover:text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <h4 className="text-lg font-black text-white">Wallet Control</h4>
              <p className="text-blue-200 text-[10px] mt-1 font-medium">Add daily float cash to staff and reset balances.</p>
            </div>
          </Link>

          <Link href="/reports" className="group">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-900 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-900 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-800">Reports</h4>
              <p className="text-slate-400 text-[10px] mt-1 font-medium">Export CSV data and analyze performance.</p>
            </div>
          </Link>

          <Link href="/pending-jobs" className="group">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-800">Pending Jobs</h4>
              <p className="text-slate-400 text-[10px] mt-1 font-medium">Manage queue and cancel jobs for student refunds.</p>
            </div>
          </Link>

          <Link href="/logs" className="group">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-red-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-800">Audit Logs</h4>
              <p className="text-slate-400 text-[10px] mt-1 font-medium">Monitor real-time staff activity and history logs.</p>
            </div>
          </Link>

          <Link href="/settings" className="group">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-900 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-700 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-800">System Settings</h4>
              <p className="text-slate-400 text-[10px] mt-1 font-medium">Configure commission formulas and system keys.</p>
            </div>
          </Link>

          <Link href="/reconciliation" className="group">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer h-full">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-800">Reconciliation</h4>
              <p className="text-slate-400 text-[10px] mt-1 font-medium">Audit physical ledger matches and cash deposits.</p>
            </div>
          </Link>
        </div>

        {/* Transaction Volume Summary */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 mb-12">
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
        type="button"
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