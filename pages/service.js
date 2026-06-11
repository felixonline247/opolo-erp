import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import StaffChat from '../components/StaffChat'

export default function ServiceQueue() {
  const [loading, setLoading] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false) 
  const [userProfile, setUserProfile] = useState({ name: '', email: '', id: null, role: '', balance: 0, commission_type: 'fixed', commission_value: 0 })
  const [pendingQueue, setPendingQueue] = useState([]) 
  const [activeJobs, setActiveJobs] = useState([])     
  const [stats, setStats] = useState({ completed: 0, commission: 0 })
  const [supervisorOverhead, setSupervisorOverhead] = useState(0) // 🚀 Supervisor Override State
  
  const [filterMode, setFilterMode] = useState('today') 
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0])
  const [queueSearch, setQueueSearch] = useState('') 

  const router = useRouter()

  useEffect(() => {
    checkServiceAccess()
  }, [])

  useEffect(() => {
    if (!userProfile.id) return

    fetchQueueAndStats(userProfile.id)

    const queueChannel = supabase
      .channel('live-queue-mutations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => {
          fetchQueueAndStats(userProfile.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(queueChannel)
    }
  }, [filterMode, customDate, userProfile.id])

  const checkServiceAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, current_wallet_balance, commission_type, commission_value')
        .eq('id', session.user.id)
        .single()

      if (error) throw error

      const allowedRoles = ['Staff', 'Service Staff', 'Manager', 'Admin', 'Account', 'Consultant', 'Supervisor'];
      if (!allowedRoles.includes(profile?.role)) {
        router.push('/dashboard')
      } else {
        setUserProfile({ 
          name: profile.full_name, 
          email: profile.email || session.user.email, 
          id: profile.id,
          role: profile.role,
          balance: profile.current_wallet_balance || 0,
          commission_type: profile.commission_type || 'fixed',
          commission_value: Number(profile.commission_value || 0)
        })
        setLoading(false)
      }
    } catch (err) {
      console.error("Auth Error:", err.message)
      router.push('/')
    }
  }

  const fetchQueueAndStats = async (sId) => {
    try {
      const { data: pendingData } = await supabase
        .from('students')
        .select(`id, full_name, phone_number, status, jamb_profile_code, assigned_consultant_id, consultant:profiles!students_assigned_consultant_id_fkey(full_name, vip_auth_code), services(service_name)`)
        .eq('status', 'Awaiting Service')
        .eq('is_deleted', false)
        .order('payment_confirmed_at', { ascending: true })

      const { data: activeData } = await supabase
        .from('students')
        .select(`id, full_name, phone_number, assigned_consultant_id, consultant:profiles!students_assigned_consultant_id_fkey(full_name), services(service_name)`)
        .eq('status', 'Started')
        .eq('started_by', sId)

      // 🚀 Pulling cost attributes to support supervisor financial mathematical loops
      let query = supabase
        .from('students')
        .select('id, staff_commission, consultant_commission, completed_at, amount_paid, institution_cost, is_supervisor_payout_completed')
        .eq('completed_by', sId)
        .eq('status', 'Completed')
        .eq('is_deleted', false)

      if (filterMode === 'today') {
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('completed_at', `${today}T00:00:00`).lte('completed_at', `${today}T23:59:59`)
      } else if (filterMode === 'custom') {
        query = query.gte('completed_at', `${customDate}T00:00:00`).lte('completed_at', `${customDate}T23:59:59`)
      }

      const { data: completedData } = await query
      let totalComm = completedData?.reduce((acc, job) => acc + Number(job.staff_commission || 0) + Number(job.consultant_commission || 0), 0) || 0

      // 🚀 Compute Capped 2.5% Supervisor Override Balance dynamically
      let accumulatedOverhead = 0
      completedData?.forEach(job => {
        if (job.is_supervisor_payout_completed) return
        const netProfit = Number(job.amount_paid || 0) - Number(job.institution_cost || 0)
        if (netProfit > 0) {
          let cut = netProfit * 0.025
          if (cut > 17500) cut = 17500
          accumulatedOverhead += cut
        }
      })

      setPendingQueue(pendingData || [])
      setActiveJobs(activeData || [])
      setStats({ completed: completedData?.length || 0, commission: totalComm })
      setSupervisorOverhead(accumulatedOverhead)
    } catch (err) {
      console.error("Data Fetch Error:", err.message)
    }
  }

  const startJob = async (id) => {
    try {
      const { data: realTimeCheck, error: checkError } = await supabase
        .from('students')
        .select('status, full_name')
        .eq('id', id)
        .single()

      if (checkError) throw checkError;
      if (realTimeCheck.status !== 'Awaiting Service') {
        return alert(`⚠️ This student (${realTimeCheck.full_name}) has already been claimed by another staff member!`);
      }

      const job = pendingQueue.find(s => s.id === id);
      if (job && job.assigned_consultant_id && userProfile.id !== job.assigned_consultant_id) {
        const enteredPin = window.prompt(`🔒 VIP PROTECTED TASK\nThis student belongs to Consultant: ${job.consultant?.full_name}.\n\nEnter the Authorization PIN to perform this task on their behalf:`);
        if (enteredPin !== job.consultant?.vip_auth_code) {
          return alert("❌ Invalid Authorization Code. Access Denied.");
        }
      }

      const { error } = await supabase
        .from('students')
        .update({ 
          status: 'Started', 
          started_by: userProfile.id,
          started_at: new Date().toISOString() 
        })
        .eq('id', id)

      if (error) throw error
      fetchQueueAndStats(userProfile.id)
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  const completeJob = async (studentId) => {
    if (!confirm("Confirm completion? This will finalize the task and record your commission.")) return
    try {
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select(`amount_paid, institution_cost, service_id, assigned_consultant_id`)
        .eq('id', studentId)
        .single()

      if (fetchError) throw fetchError

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session lost.");

      const { data: staffProfile, error: staffProfileError } = await supabase
        .from('profiles')
        .select('commission_type, commission_value')
        .eq('id', session.user.id)
        .single();

      if (staffProfileError || !staffProfile) {
        throw new Error("Could not retrieve your verified staff profile parameters.");
      }

      let calculatedComm = 0;
      let consultantComm = 0;
      const paid = Number(student.amount_paid) || 0;
      const inst = Number(student.institution_cost) || 0;
      const netProfit = paid - inst;

      const staffType = staffProfile.commission_type?.toLowerCase();
      const staffVal = Number(staffProfile.commission_value) || 0;

      if (staffType === 'percentage') {
        calculatedComm = netProfit * (staffVal / 100);
      } else {
        calculatedComm = staffVal;
      }

      if (student.assigned_consultant_id) {
        const { data: consultantProfile, error: consultantError } = await supabase
          .from('profiles')
          .select('commission_type, commission_value')
          .eq('id', student.assigned_consultant_id)
          .single();

        if (!consultantError && consultantProfile) {
          const consulType = consultantProfile.commission_type?.toLowerCase();
          const consulVal = Number(consultantProfile.commission_value) || 0;

          if (consulType === 'percentage') {
            consultantComm = netProfit * (consulVal / 100);
          } else {
            consultantComm = consulVal;
          }
        }
      }

      const { error: updateError } = await supabase
        .from('students')
        .update({ 
          status: 'Completed',
          completed_by: session.user.id,
          completed_at: new Date().toISOString(),
          staff_commission: calculatedComm,
          consultant_commission: consultantComm,
          commission_earned: calculatedComm 
        })
        .eq('id', studentId)

      if (updateError) throw updateError
      
      fetchQueueAndStats(session.user.id)
      alert(`Task Completed! ₦${calculatedComm.toLocaleString()} commission recorded.`)
    } catch (err) {
      console.error("Completion Process Error:", err)
      alert(`Error: ${err.message}`);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filteredQueue = pendingQueue.filter(student => {
    const searchWord = queueSearch.toLowerCase().trim();
    if (!searchWord) return true;
    return (
      student.full_name?.toLowerCase().includes(searchWord) ||
      student.phone_number?.includes(searchWord) ||
      student.jamb_profile_code?.toLowerCase().includes(searchWord)
    );
  });

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Loading Service Station...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-12 relative overflow-x-hidden text-blue-950">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-blue-950 uppercase italic tracking-tighter">Service Station</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">{userProfile.name} • {userProfile.role}</p>
          </div>
          <div className="flex items-center gap-3">
            {['Manager', 'Admin', 'Account', 'Supervisor'].includes(userProfile.role) && (
              <Link href="/supervision-inbox">
                <span className="px-5 py-2 border-2 border-amber-950 bg-amber-500 text-blue-950 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(26,54,93,1)]">
                  👁️ Supervision Inbox
                </span>
              </Link>
            )}
            {userProfile.role === 'Supervisor' && (
              <Link href="/pending-jobs">
                <span className="px-5 py-2 border-2 border-purple-950 bg-purple-900 text-white rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-black transition-all shadow-[2px_2px_0px_0px_rgba(26,54,93,1)]">
                  ⚙️ Pending Jobs Panel
                </span>
              </Link>
            )}
            <Link href="/activity-log">
              <span className="px-5 py-2 border-2 border-blue-950 bg-white text-blue-950 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-100 shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] transition-all">
                📜 Activity Log
              </span>
            </Link>
            <button onClick={handleLogout} className="px-6 py-2 border-2 border-red-100 text-red-500 rounded-full text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">Logout</button>
          </div>
        </header>

        {/* 🚀 STATS CARDS GENERATOR GRID */}
        <div className={`grid grid-cols-1 ${userProfile.role === 'Supervisor' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Jobs ({filterMode})</p>
            <h2 className="text-4xl font-black text-blue-950 tracking-tighter">{stats.completed}</h2>
            <div className="mt-6 flex gap-2">
               {['today', 'total', 'custom'].map(m => (
                 <button key={m} onClick={() => setFilterMode(m)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filterMode === m ? 'bg-blue-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>{m}</button>
               ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-blue-600 uppercase mb-2 tracking-widest">Commission</p>
            <h2 className="text-4xl font-black tracking-tighter text-blue-600">₦{stats.commission.toLocaleString()}</h2>
          </div>

          {/* 🚀 NEW: CAPPED SUPERVISOR OVERRIDE METRICS DISPLAY BLOCK CARD */}
          {userProfile.role === 'Supervisor' && (
            <div className="bg-white p-8 rounded-[2.5rem] border-4 border-amber-500 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
              <p className="text-[10px] font-black text-amber-600 uppercase mb-2 tracking-widest">⚡ Supervisor Commission ({filterMode})</p>
              <h2 className="text-4xl font-black tracking-tighter text-amber-600">₦{supervisorOverhead.toLocaleString()}</h2>
              <p className="text-[8px] font-mono text-slate-400 mt-2 uppercase tracking-tight">* Capped at ₦17,500 max per individual task</p>
            </div>
          )}

          <Link href="/payment-wallet">
            <div className="bg-blue-900 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-blue-900/20 cursor-pointer hover:scale-[1.02] transition-all group overflow-hidden">
              <p className="text-[10px] font-black uppercase opacity-60 mb-2 tracking-widest">Wallet</p>
              <h2 className={`text-4xl font-black tracking-tighter ${userProfile.balance < 1000 ? 'text-red-400' : 'text-white'}`}>
                ₦{userProfile.balance.toLocaleString()}
              </h2>
              <div className="mt-6 text-[9px] font-black uppercase tracking-widest opacity-80 group-hover:opacity-100">Top Up →</div>
            </div>
          </Link>
        </div>

        {/* NEO-BRUTALIST QUICK LINK CARD BANNER */}
        <div className="mb-10">
          <Link href="/activity-log">
            <div className="bg-white border-4 border-blue-950 p-6 rounded-[2rem] flex items-center justify-between shadow-[6px_6px_0px_0px_rgba(26,54,93,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,54,93,1)] transition-all cursor-pointer group">
              <div>
                <h4 className="text-lg font-black uppercase tracking-tight text-blue-950">Performance History</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Review your completed jobs and filter tasks by specific dates</p>
              </div>
              <span className="bg-blue-500 text-white px-5 py-2.5 border-2 border-blue-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] group-hover:bg-blue-600 transition-colors">
                Open Logs →
              </span>
            </div>
          </Link>
        </div>

        {/* ACTIVE WORKLIST */}
        {activeJobs.length > 0 && (
          <div className="mb-12">
            <h3 className="text-[11px] font-black text-green-600 uppercase mb-4 tracking-[0.2em]">⚡ Active Tasks</h3>
            <div className="grid gap-4">
              {activeJobs.map(job => (
                <div key={job.id} className="bg-white border-4 border-green-500 p-8 rounded-[3rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-black text-blue-950 text-2xl uppercase tracking-tighter italic">{job.full_name}</p>
                      {job.assigned_consultant_id && (
                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border border-purple-200">
                          ⭐ VIP Consultant: {job.consultant?.full_name}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-black text-green-600 uppercase bg-green-50 px-3 py-1 rounded-full inline-block mt-2">{job.services?.service_name}</p>
                  </div>
                  <button onClick={() => completeJob(job.id)} className="w-full md:w-auto bg-green-500 text-white px-10 py-4 border-2 border-blue-950 rounded-2xl text-[11px] font-black uppercase hover:bg-green-600 transition-all shadow-[3px_3px_0px_0px_rgba(26,54,93,1)]">Finish Task</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PENDING QUEUE */}
        <div className="bg-white rounded-[3rem] border-4 border-blue-950 overflow-hidden shadow-[6px_6px_0px_0px_rgba(26,54,93,1)] mb-12">
            <div className="p-8 border-b-4 border-blue-950 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
               <h3 className="text-[11px] font-black text-blue-950 uppercase tracking-[0.2em]">Queue Workflow Ledger ({filteredQueue.length})</h3>
               
               <div className="w-full sm:w-72 relative">
                 <input 
                   type="text" 
                   value={queueSearch}
                   onChange={(e) => setQueueSearch(e.target.value)}
                   placeholder="Search name or phone..." 
                   className="w-full px-4 py-2 bg-white text-xs font-bold border-2 border-blue-950 rounded-xl outline-none focus:bg-blue-50 text-blue-950 shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] placeholder-slate-400"
                 />
                 {queueSearch && (
                   <button onClick={() => setQueueSearch('')} className="absolute right-3 top-2 text-[10px] font-black text-slate-400 hover:text-red-500">✕</button>
                 )}
               </div>
            </div>
            <div className="divide-y-2 divide-slate-100">
             {filteredQueue.map((student) => (
               <div key={student.id} className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 hover:bg-blue-50/30 transition-colors">
                 <div className="text-center md:text-left">
                    <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                       <p className="font-black text-blue-950 uppercase tracking-tight text-lg">{student.full_name}</p>
                       {student.assigned_consultant_id && (
                         <span className="bg-purple-100 text-purple-700 px-3 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border border-purple-200">
                           VIP: {student.consultant?.full_name}
                         </span>
                       )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{student.services?.service_name} • {student.phone_number}</p>
                    <p className="text-[9px] font-black text-blue-500 mt-1 uppercase">STATUS MAPPING: {student.status}</p>
                 </div>
                 <button onClick={() => startJob(student.id)} className={`${student.assigned_consultant_id ? 'bg-purple-50 border-2 border-purple-200 text-purple-900 hover:bg-purple-900' : 'bg-white border-2 border-slate-100 text-blue-950 hover:border-blue-900'} px-8 py-3 rounded-2xl text-[10px] font-black uppercase hover:text-white transition-all`}>
                   {student.assigned_consultant_id ? '🔐 Start VIP Task' : 'Start Task'}
                 </button>
               </div>
             ))}
             {filteredQueue.length === 0 && (
               <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-[0.5em]">No matching jobs inside queue</div>
             )}
            </div>
        </div>
      </div>

      {/* --- SLIDE-OUT CHAT SYSTEM --- */}
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`fixed bottom-8 right-8 z-[70] flex items-center justify-center w-16 h-16 rounded-full border-4 border-blue-950 shadow-2xl transition-all duration-300 ${
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

      {isChatOpen && (
        <div className="fixed inset-0 bg-blue-950/40 backdrop-blur-sm z-[50] transition-opacity" onClick={() => setIsChatOpen(false)} />
      )}

      <aside className={`fixed top-0 right-0 h-full w-full md:w-[450px] bg-white z-[60] shadow-2xl transition-transform duration-500 ease-in-out transform ${
        isChatOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="h-full flex flex-col pt-6">
          <div className="px-8 flex justify-between items-center mb-4">
             <h2 className="text-xs font-black text-blue-950 uppercase tracking-[0.2em]">Staff Comms</h2>
             <button onClick={() => setIsChatOpen(false)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest">Close →</button>
          </div>
          <div className="flex-1 overflow-hidden">
             <StaffChat currentUser={userProfile} />
          </div>
        </div>
      </aside>

    </div>
  )
}