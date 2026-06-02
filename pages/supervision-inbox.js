import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function SupervisionInbox() {
  const [loading, setLoading] = useState(true)
  const [supervisorView, setSupervisorView] = useState([])
  const [userRole, setUserRole] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkSupervisionAccess()
  }, [])

  useEffect(() => {
    if (!userRole) return

    fetchMonitoredJobs()

    const updatesChannel = supabase
      .channel('live-supervision-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => {
          fetchMonitoredJobs()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(updatesChannel)
    }
  }, [userRole])

  const checkSupervisionAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      const allowedRoles = ['Manager', 'Admin', 'Account', 'Supervisor']
      if (!allowedRoles.includes(profile?.role)) {
        alert("Access Denied: Management or Supervisor clearance required.")
        router.push('/dashboard')
      } else {
        setUserRole(profile.role)
        setLoading(false)
      }
    } catch (err) {
      console.error("Supervision Gate Error:", err)
      router.push('/')
    }
  }

  const fetchMonitoredJobs = async () => {
    const { data } = await supabase
      .from('students')
      .select(`
        id, 
        full_name, 
        status, 
        started_at,
        services(service_name),
        profiles!students_started_by_fkey(full_name)
      `)
      .eq('status', 'Started')
      .eq('is_deleted', false)
      .order('started_at', { ascending: false })

    setSupervisorView(data || [])
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Loading Supervision Channels...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-12 text-blue-950">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER BARS */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter italic">Supervision Command Box</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Live active worker session monitoring ledger</p>
          </div>
          <button 
            onClick={() => router.back()} 
            className="px-6 py-2.5 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase hover:bg-slate-100 transition-all shadow-sm"
          >
            ← Back Station
          </button>
        </header>

        {/* ACTIVE WORKER TRACKING BLOCK */}
        <div className="bg-white rounded-[2.5rem] border-4 border-blue-950 overflow-hidden shadow-[6px_6px_0px_0px_rgba(26,54,93,1)]">
          <div className="p-6 bg-slate-50 border-b-4 border-blue-950 flex justify-between items-center">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-blue-950">Active Registrations Under Review</h3>
            <span className="bg-blue-100 px-3 py-1 rounded text-[10px] font-black text-blue-900 uppercase">
              {supervisorView.length} Staff Processing
            </span>
          </div>

          <div className="divide-y-2 divide-slate-100">
            {supervisorView.map((job) => (
              <div key={job.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                <div>
                  <h4 className="font-black text-blue-950 text-base uppercase">{job.full_name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                    Task: <span className="text-blue-600">{job.services?.service_name || 'General Utility'}</span>
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="inline-block bg-amber-500 text-white font-black text-[9px] px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm animate-pulse">
                    👨‍💻 Assigned Worker: {job.profiles?.full_name || 'System Operator'}
                  </span>
                  <p className="text-[8px] font-mono text-slate-400 uppercase mt-1">
                    Started: {new Date(job.started_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {supervisorView.length === 0 && (
              <div className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-[0.3em] italic">
                No active processing tasks found on the operational floor.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}