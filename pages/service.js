import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function ServiceQueue() {
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState({ name: '', email: '', id: null, role: '' })
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({ completed: 0, commission: 0 })
  
  // Filtering States
  const [filterMode, setFilterMode] = useState('total') 
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0])

  const router = useRouter()

  useEffect(() => {
    checkServiceAccess()
  }, [])

  useEffect(() => {
    if (userProfile.id) {
      fetchQueueAndStats(userProfile.id)
    }
  }, [filterMode, customDate, userProfile.id])

  const checkServiceAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', session.user.id)
        .single()

      if (error) throw error

      const allowedRoles = ['Staff', 'Service Staff', 'Manager', 'Admin', 'Account'];
      if (!allowedRoles.includes(profile?.role)) {
        router.push('/dashboard')
      } else {
        setUserProfile({ 
          name: profile.full_name, 
          email: profile.email || session.user.email, 
          id: profile.id,
          role: profile.role 
        })
        fetchQueueAndStats(profile.id)
        setLoading(false)
      }
    } catch (err) {
      console.error("Auth Error:", err.message)
      router.push('/')
    }
  }

  const fetchQueueAndStats = async (sId) => {
    try {
      // 1. Fetch Active Queue
      const { data: queueData, error: qError } = await supabase
        .from('students')
        .select(`
          id, 
          full_name, 
          phone_number,
          jamb_profile_code, 
          notification_sent,
          services (
            service_name
          )
        `)
        .eq('status', 'Paid')
        .eq('is_deleted', false)
        .order('payment_confirmed_at', { ascending: true })

      if (qError) throw qError

      // 2. Fetch Personal Stats
      let query = supabase
        .from('students')
        .select('id, staff_commission, completed_at')
        .eq('completed_by', sId)
        .eq('status', 'Completed')
        .eq('is_deleted', false)

      if (filterMode === 'today') {
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('completed_at', `${today}T00:00:00`)
                     .lte('completed_at', `${today}T23:59:59`)
      } else if (filterMode === 'custom') {
        query = query.gte('completed_at', `${customDate}T00:00:00`)
                     .lte('completed_at', `${customDate}T23:59:59`)
      }

      const { data: completedData, error: sError } = await query
      if (sError) throw sError

      let totalComm = 0
      completedData?.forEach(job => {
        totalComm += Number(job.staff_commission || 0)
      })

      setQueue(queueData || [])
      setStats({ completed: completedData?.length || 0, commission: totalComm })
    } catch (err) {
      console.error("Data Fetch Error:", err.message)
    }
  }

  const deleteStudent = async (id) => {
    if (!confirm("Are you sure? This will remove the student from the active queue (Soft Delete).")) return
    
    try {
      const { error } = await supabase
        .from('students')
        .update({ 
          is_deleted: true, 
          deleted_at: new Date().toISOString(),
          deleted_by: (await supabase.auth.getSession()).data.session?.user.id 
        })
        .eq('id', id)

      if (error) throw error
      
      alert("Student moved to archive successfully.")
      fetchQueueAndStats(userProfile.id)
    } catch (err) {
      alert(`Delete Error: ${err.message}`)
    }
  }

  const sendPickupNotification = async (student) => {
    try {
      const { data: settings, error: settingsError } = await supabase
        .from('settings')
        .select('sms_template')
        .single()

      if (settingsError) throw new Error("Could not load SMS template.")

      const template = settings.sms_template || "Hello {name}, your {service} is ready for pickup at Opolo CBT Resort."
      const personalizedMessage = template
        .replace('{name}', student.full_name)
        .replace('{service}', student.services?.service_name || 'JAMB Service')

      console.log(`Sending SMS to ${student.phone_number}: ${personalizedMessage}`)

      const { error: updateError } = await supabase
        .from('students')
        .update({ 
          notification_sent: true,
          slip_ready_at: new Date().toISOString() 
        })
        .eq('id', student.id)

      if (updateError) throw updateError

      alert(`Notification Sent Successfully!\n\nMessage: "${personalizedMessage}"`)
      fetchQueueAndStats(userProfile.id)
      
    } catch (err) {
      console.error("Notification Error:", err)
      alert(`Notification Failed: ${err.message}`)
    }
  }

  const completeJob = async (studentId) => {
    if (!confirm("Confirm completion? This will record your commission.")) return
    try {
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('amount_paid, institution_cost, service_id')
        .eq('id', studentId)
        .single()

      if (fetchError) throw fetchError

      const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('id', student.service_id)
        .single()

      if (serviceError) throw serviceError

      const commType = service.commission_type || service.comm_type || 'fixed'
      const commVal = Number(service.commission_value || service.comm_value || 350)
      
      let calculatedComm = 0
      const paid = Number(student.amount_paid) || 0
      const inst = Number(student.institution_cost) || 0
      const netProfit = paid - inst

      if (commType === 'percentage' || commType === 'percent') {
        calculatedComm = (netProfit * (commVal / 100))
      } else {
        calculatedComm = commVal
      }

      const { error: updateError } = await supabase
        .from('students')
        .update({ 
          status: 'Completed',
          completed_by: userProfile.id,
          completed_at: new Date().toISOString(),
          staff_commission: calculatedComm 
        })
        .eq('id', studentId)

      if (updateError) throw updateError
      
      fetchQueueAndStats(userProfile.id)
      alert(`Success! Job completed. ₦${calculatedComm.toLocaleString()} recorded.`)
      
    } catch (err) {
      console.error("Detailed Error:", err)
      alert(`Error: ${err.message}`)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center font-black text-blue-900 uppercase tracking-widest animate-pulse">
        Initializing Service Station...
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-blue-950 uppercase tracking-tighter">Service Queue</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {userProfile.name} • {userProfile.role}
            </p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 border-2 border-red-100 text-red-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
            Logout
          </button>
        </header>

        {/* STATS FILTER BAR */}
        <div className="flex flex-wrap items-center gap-3 mb-8 bg-white p-3 md:p-4 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[9px] font-black text-blue-950 uppercase tracking-widest ml-2">Filters:</p>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['today', 'total', 'custom'].map((mode) => (
              <button 
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase transition-all ${filterMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >
                {mode}
              </button>
            ))}
          </div>
          
          {filterMode === 'custom' && (
            <input 
              type="date" 
              className="bg-slate-50 border-none ring-1 ring-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold text-blue-950 outline-none focus:ring-blue-500"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}

          <button 
            onClick={() => fetchQueueAndStats(userProfile.id)}
            className="ml-auto px-4 py-2 text-blue-600 font-bold text-[10px] uppercase hover:underline"
          >
            Refresh
          </button>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Jobs {filterMode === 'total' ? 'Overall' : filterMode === 'today' ? 'Today' : `on ${customDate}`}
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-blue-950">{stats.completed}</h2>
          </div>
          <div className="bg-blue-900 p-6 md:p-8 rounded-[2rem] text-white shadow-xl shadow-blue-900/30">
            <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mb-2">
              Commission {filterMode === 'total' ? '(Total)' : filterMode === 'today' ? '(Today)' : `(${customDate})`}
            </p>
            <h2 className="text-3xl md:text-4xl font-black">₦{stats.commission.toLocaleString()}</h2>
          </div>
        </div>

        {/* QUEUE LIST */}
        <div className="flex justify-between items-center mb-6 ml-2">
          <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.3em]">Pending Queue ({queue.length})</h3>
        </div>

        <div className="grid gap-4">
          {queue.map((student, index) => (
            <div key={student.id || `student-${index}`} className="bg-white p-5 md:p-6 rounded-[2rem] border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-blue-200 transition-colors">
              
              {/* Left: Info */}
              <div className="w-full">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-blue-950 uppercase text-lg leading-tight break-words">{student.full_name}</p>
                  {student.notification_sent && (
                    <span className="text-[8px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-black uppercase">Notified</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="text-[9px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded">
                    {student.services?.service_name || 'General Service'}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">
                    ID: {student.jamb_profile_code}
                  </span>
                </div>
              </div>
              
              {/* Right: Actions (Responsive buttons) */}
              <div className="grid grid-cols-4 md:flex gap-2 w-full md:w-auto">
                <button 
                  onClick={() => completeJob(student.id)}
                  className="col-span-4 md:w-32 py-4 bg-green-500 hover:bg-blue-950 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95"
                >
                  Complete
                </button>
                
                <button 
                  onClick={() => sendPickupNotification(student)}
                  className={`col-span-3 md:w-28 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${student.notification_sent ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}
                >
                  {student.notification_sent ? 'Resend' : 'SMS'}
                </button>

                {(userProfile.role === 'Manager' || userProfile.role === 'Admin') && (
                  <button 
                    onClick={() => deleteStudent(student.id)}
                    className="col-span-1 p-4 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all flex items-center justify-center"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {queue.length === 0 && (
            <div className="p-16 text-center border-2 border-dashed border-slate-200 rounded-[3rem]">
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Queue is empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}