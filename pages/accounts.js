import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import StaffChat from '../components/StaffChat'

export default function AccountsDashboard() {
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  
  // Filtering States
  const [timeframe, setTimeframe] = useState('today') 
  const [customDates, setCustomDates] = useState({ start: '', end: '' })
  
  const [userProfile, setUserProfile] = useState({ name: '', email: '', id: null, role: '' })
  const [pendingStudents, setPendingStudents] = useState([])
  const [customPrices, setCustomPrices] = useState({}) 
  
  // SYNCHRONIZED: Default visibility matrix
  const [visibility, setVisibility] = useState({
    showGross: true,
    showCommissions: true,
    showRemittance: true,
    showNet: true,
    showAgent: true
  })

  const [stats, setStats] = useState({ 
    totalGross: 0,    
    netProfit: 0,     
    remittance: 0,    
    commissions: 0,
    agentGross: 0 
  })
  const router = useRouter()

  // FIXED: Pulls visibility rules directly from the global master key set by the Manager
  useEffect(() => {
    const cachedVisibility = localStorage.getItem('opolo_master_visibility')
    if (cachedVisibility) {
      try {
        setVisibility(JSON.parse(cachedVisibility))
      } catch (e) {
        console.error("Failed parsing master visibility stream:", e)
      }
    }
  }, [])

  useEffect(() => {
    const initializePage = async () => {
      await checkAccountAccess()
    }
    initializePage()
  }, [])

  useEffect(() => {
    if (userProfile.id) {
      fetchPendingData()
      fetchFinanceStats()
    }
  }, [timeframe, customDates, userProfile.id])

  // FIXED: Syncs live manual adjustments to the shared storage space
  const toggleVisibilitySetting = (key) => {
    const updatedVisibility = { ...visibility, [key]: !visibility[key] }
    setVisibility(updatedVisibility)
    localStorage.setItem('opolo_master_visibility', JSON.stringify(updatedVisibility))
  }

  const checkAccountAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', session.user.id)
        .single()

      const allowed = ['Account', 'Manager', 'Admin'];
      if (error || !allowed.includes(profile?.role)) {
        router.push('/dashboard')
      } else {
        setUserProfile({
          name: profile.full_name,
          email: profile.email || session.user.email,
          id: profile.id,
          role: profile.role
        })
      }
    } catch (err) {
      console.error("Access Check Error:", err)
    } finally {
      setLoading(false)
    }
  }

  const getDateRange = () => {
    const now = new Date()
    let start = new Date()
    let end = new Date()

    if (timeframe === 'today') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (timeframe === 'week') {
      const currentDay = now.getDay()
      start.setDate(now.getDate() - currentDay)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else if (timeframe === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end.setHours(23, 59, 59, 999)
    } else if (timeframe === 'custom' && customDates.start && customDates.end) {
      start = new Date(customDates.start)
      start.setHours(0, 0, 0, 0)
      end = new Date(customDates.end)
      end.setHours(23, 59, 59, 999)
    }
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const fetchPendingData = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id, 
          full_name, 
          amount_paid, 
          institution_cost, 
          created_at, 
          assigned_consultant_id,
          registration_source,
          consultant:profiles!students_assigned_consultant_id_fkey(full_name),
          services (service_name)
        `)
        .eq('status', 'Awaiting Payment') 
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })

      if (error) throw error
      setPendingStudents(data || [])
    } catch (err) {
      console.error("Fetch Error:", err.message)
    }
  }

  const fetchFinanceStats = async () => {
    const { start, end } = timeframe === 'all' ? { start: null, end: null } : getDateRange()
    
    try {
      let query = supabase
        .from('students')
        .select(`amount_paid, institution_cost, staff_commission, consultant_commission, commission_earned, status, registration_source`)
        .in('status', ['Awaiting Service', 'Started', 'Completed'])
        .eq('is_deleted', false)

      if (start && timeframe !== 'all') {
        query = query.gte('created_at', start).lte('created_at', end)
      }

      const { data, error } = await query
      if (error) throw error
      
      if (data) {
        let gross = 0; let remit = 0; let comms = 0; let profit = 0; let agentInflow = 0;

        data.forEach(item => {
          const valPaid = Number(item.amount_paid || 0)
          const valInst = Number(item.institution_cost || 0)
          const valComm = Number(item.commission_earned || item.staff_commission || 0) + Number(item.consultant_commission || 0) 
          
          gross += valPaid
          remit += valInst
          comms += valComm
          profit += (valPaid - valInst - valComm) 

          if (item.registration_source === 'Business Center') {
            agentInflow += valPaid
          }
        })

        setStats({ 
          totalGross: gross, 
          netProfit: profit, 
          remittance: remit, 
          commissions: comms,
          agentGross: agentInflow 
        })
      }
    } catch (err) {
      console.error("Stats Error:", err.message)
    }
  }

  const handlePriceEdit = (id, newPrice) => {
    setCustomPrices(prev => ({ ...prev, [id]: newPrice }))
  }

  const confirmPayment = async (studentId, method) => {
    if (isProcessing) return;
    
    const student = pendingStudents.find(s => s.id === studentId);
    const finalAmount = customPrices[studentId] !== undefined ? Number(customPrices[studentId]) : Number(student.amount_paid);

    const isConfirmed = window.confirm(`Confirm ${method} payment of ₦${finalAmount.toLocaleString()}?`);
    if (!isConfirmed) return;

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ 
          status: 'Awaiting Service', 
          payment_method: method,
          amount_paid: finalAmount, 
          account_officer_email: userProfile.email,
          payment_confirmed_at: new Date().toISOString() 
        })
        .eq('id', studentId)

      if (error) throw error
      
      setPendingStudents(prev => prev.filter(s => s.id !== studentId))
      setCustomPrices(prev => { const next = {...prev}; delete next[studentId]; return next; })
      await fetchFinanceStats()
      
    } catch (err) {
      alert("Verification Error: " + err.message)
    } finally {
      setIsProcessing(false);
    }
  }

  const handleBusinessCenterApproval = async (studentId) => {
    if (isProcessing) return;
    const student = pendingStudents.find(s => s.id === studentId);
    
    const verify = window.confirm(`Verify cash parameters and authorize release to Service Queue for ${student.full_name}?`);
    if (!verify) return;

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({
          status: 'Awaiting Service',
          account_officer_email: userProfile.email,
          payment_confirmed_at: new Date().toISOString()
        })
        .eq('id', studentId);

      if (error) throw error;

      setPendingStudents(prev => prev.filter(s => s.id !== studentId));
      await fetchFinanceStats();
      alert("B2B Parameters verified. Student released to operations workflow queue.");
    } catch (err) {
      alert("Approval Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Loading Accounts...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans text-blue-950 relative overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter italic">Accounts Portal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Active: {userProfile.name} ({userProfile.role})</p>
          </div>
          
          {/* TIMEFRAME TOGGLE */}
          <div className="flex flex-wrap items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1">
            {['today', 'week', 'month', 'all', 'custom'].map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                  timeframe === t ? 'bg-blue-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
             <button onClick={() => router.push('/dashboard')} className="px-6 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase hover:bg-slate-100 transition-all">Dashboard</button>
             <button onClick={async () => { await supabase.auth.signOut(); router.push('/'); }} className="px-6 py-2 bg-red-50 text-red-500 border border-red-100 rounded-full text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">Logout</button>
          </div>
        </header>

        {/* METRICS TOGGLES ROW (Shows for Managers/Admins visiting the Accounts page) */}
        {(userProfile.role === 'Manager' || userProfile.role === 'Admin') && (
          <div className="mb-8 p-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm flex flex-wrap gap-4 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Metrics Control switches:</span>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => toggleVisibilitySetting('showGross')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showGross ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
              >
                Gross Rev: {visibility.showGross ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => toggleVisibilitySetting('showRemittance')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showRemittance ? 'bg-red-100 text-red-900 border-red-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
              >
                Remittance: {visibility.showRemittance ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => toggleVisibilitySetting('showNet')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showNet ? 'bg-green-100 text-green-900 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
              >
                Net Profit: {visibility.showNet ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => toggleVisibilitySetting('showAgent')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${visibility.showAgent ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
              >
                Partner Agents: {visibility.showAgent ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}

        {/* CUSTOM DATE PICKER */}
        {timeframe === 'custom' && (
          <div className="mb-8 flex gap-4 bg-blue-50 p-6 rounded-[2rem] border border-blue-100 animate-in fade-in slide-in-from-top-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-blue-400 ml-2">Start Date</label>
              <input 
                type="date" 
                className="bg-white border-none rounded-xl px-4 py-2 text-xs font-bold outline-none ring-2 ring-blue-100 focus:ring-blue-500"
                onChange={(e) => setCustomDates({...customDates, start: e.target.value})}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase text-blue-400 ml-2">End Date</label>
              <input 
                type="date" 
                className="bg-white border-none rounded-xl px-4 py-2 text-xs font-bold outline-none ring-2 ring-blue-100 focus:ring-blue-500"
                onChange={(e) => setCustomDates({...customDates, end: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* FINANCIAL METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {visibility.showGross && (
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm transition-all animate-in fade-in zoom-in-95">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Gross {timeframe} Revenue</p>
              <h2 className="text-2xl font-black text-slate-900">₦{stats.totalGross.toLocaleString()}</h2>
            </div>
          )}

          {visibility.showRemittance && (
            <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 transition-all animate-in fade-in zoom-in-95">
              <p className="text-[9px] font-black text-red-400 uppercase mb-2 tracking-widest">Institution Remit</p>
              <h2 className="text-2xl font-black text-red-600">₦{stats.remittance.toLocaleString()}</h2>
            </div>
          )}

          {visibility.showNet && (
            <div className="bg-blue-950 p-6 rounded-[2rem] text-white shadow-xl shadow-blue-900/10 transition-all animate-in fade-in zoom-in-95">
              <p className="text-[9px] font-black uppercase mb-2 tracking-widest opacity-60">Net Center Profit</p>
              <h2 className="text-2xl font-black">₦{stats.netProfit.toLocaleString()}</h2>
            </div>
          )}

          {visibility.showAgent && (
            <div className="bg-purple-900 p-6 rounded-[2rem] text-white shadow-xl shadow-purple-950/20 transition-all animate-in fade-in zoom-in-95">
              <p className="text-[9px] font-black uppercase mb-2 tracking-widest opacity-70">Partner Agent Income</p>
              <h2 className="text-2xl font-black">₦{stats.agentGross.toLocaleString()}</h2>
            </div>
          )}

          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[9px] font-black text-blue-600 uppercase mb-2 tracking-widest">Staff Payouts</p>
            <h2 className="text-2xl font-black text-blue-950">₦{stats.commissions.toLocaleString()}</h2>
          </div>
        </div>

        {/* COLLECTION QUEUE */}
        <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm mb-12">
          <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
               <h3 className="font-black text-blue-950 uppercase text-sm tracking-tighter">Collection Inbox</h3>
               <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Real-time payment verification queue</p>
            </div>
            <span className="bg-blue-900 text-white text-[10px] font-black px-4 py-2 rounded-full uppercase">{pendingStudents.length} Waiting</span>
          </div>
          
          <div className="divide-y divide-slate-100">
            {pendingStudents.map(student => (
              <div key={student.id} className="p-10 flex flex-col md:flex-row justify-between items-center gap-8 hover:bg-slate-50/80 transition-all">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-black text-blue-950 uppercase text-2xl tracking-tighter">{student.full_name}</p>
                    {student.registration_source === 'Business Center' ? (
                      <span className="bg-purple-900 text-white text-[8px] font-black uppercase px-3 py-1 rounded-md tracking-wider border border-purple-950">
                        🏢 Business-Centre
                      </span>
                    ) : student.assigned_consultant_id ? (
                      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm">
                        ⭐ VIP: {student.consultant?.full_name}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-3 py-1 rounded-full uppercase">{student.services?.service_name}</span>
                    <span className="text-[9px] font-bold text-slate-300 uppercase">Received: {new Date(student.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-4 w-full md:w-auto">
                  <div className="text-right flex flex-col items-end">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Due</p>
                    {student.assigned_consultant_id && student.registration_source !== 'Business Center' ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-900 font-black">₦</span>
                        <input 
                          type="number" 
                          value={customPrices[student.id] !== undefined ? customPrices[student.id] : student.amount_paid}
                          onChange={(e) => handlePriceEdit(student.id, e.target.value)}
                          className="bg-purple-50 border-2 border-purple-200 text-purple-950 font-black text-2xl w-40 pl-8 pr-4 py-2 rounded-2xl focus:outline-none focus:border-purple-500 focus:ring-4 ring-purple-100 transition-all"
                        />
                      </div>
                    ) : (
                      <p className="text-3xl font-black text-blue-950">₦{Number(student.amount_paid).toLocaleString()}</p>
                    )}
                  </div>
                    
                  <div className="flex gap-2 w-full md:w-auto">
                    {student.registration_source === 'Business Center' ? (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleBusinessCenterApproval(student.id)}
                        className="w-full md:w-auto px-10 py-4 bg-purple-900 hover:bg-black text-white text-[10px] font-black rounded-2xl transition-all uppercase tracking-widest shadow-md"
                      >
                        {isProcessing ? "Processing..." : "Approve Release"}
                      </button>
                    ) : (
                      ['Cash', 'Transfer', 'POS'].map(method => (
                        <button
                          key={method}
                          disabled={isProcessing}
                          onClick={() => confirmPayment(student.id, method)}
                          className="flex-1 md:flex-none px-8 py-4 bg-white border-2 border-slate-100 text-slate-900 text-[10px] font-black rounded-2xl hover:border-blue-900 hover:bg-blue-900 hover:text-white transition-all uppercase tracking-widest"
                        >
                          {method}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
            {pendingStudents.length === 0 && (
              <div className="p-32 text-center">
                <p className="text-slate-300 font-black uppercase text-[10px] tracking-[0.5em]">No pending collections</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CHAT SYSTEM */}
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
            <span className="absolute -top-1 -right-1 flex h-4 w-4 bg-blue-500 rounded-full border-2 border-white animate-pulse"></span>
          </div>
        )}
      </button>

      {isChatOpen && (
        <div className="fixed inset-0 bg-blue-950/40 backdrop-blur-sm z-[50]" onClick={() => setIsChatOpen(false)} />
      )}

      <aside className={`fixed top-0 right-0 h-full w-full md:w-[450px] bg-white z-[60] shadow-2xl transition-transform duration-500 ease-in-out transform ${
        isChatOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="h-full flex flex-col pt-8">
          <div className="px-8 flex justify-between items-center mb-6">
             <h2 className="text-[11px] font-black text-blue-950 uppercase tracking-[0.2em]">Internal Comms</h2>
             <button onClick={() => setIsChatOpen(false)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest">Hide Chat</button>
          </div>
          <div className="flex-1 overflow-hidden">
             <StaffChat currentUser={userProfile} />
          </div>
        </div>
      </aside>

      <footer className="mt-12 text-center pb-8">
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Opolo CBT Resort &copy; 2026 Financial Management System</p>
      </footer>
    </div>
  )
}