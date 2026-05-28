import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function PendingJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAccess()
    fetchPendingJobs()
  }, [])

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      
    if (profile?.role !== 'Manager' && profile?.role !== 'Admin') {
      router.push('/dashboard')
    }
  }

  const fetchPendingJobs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, jamb_profile_code, amount_paid, created_at, status')
      .in('status', ['Awaiting Service', 'Started']) 
      .order('created_at', { ascending: false })

    if (!error) setJobs(data || [])
    setLoading(false)
  }

  // NEW: Drop Task Handler function configuration metrics
  const handleDropTask = async (id) => {
    if (!confirm("Are you sure you want to drop this task? This will remove the current staff assignment and send it back to the Waiting Queue.")) return
    
    // Resets status back to 'Awaiting Service' and completely releases any operator lock fields
    const { error } = await supabase
      .from('students')
      .update({ 
        status: 'Awaiting Service',
        assigned_operator_id: null, // Releases the operator constraint lock if your schema uses it
        operator_email: null        // Resets worker association indicators safely
      })
      .eq('id', id)

    if (!error) {
      alert("Task dropped successfully. It is now available for other service staff to start.")
      fetchPendingJobs()
    } else {
      alert("Error dropping task: " + error.message)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm("Set this job to 'Cancelled'? (Record stays in database)")) return
    
    const { error } = await supabase
      .from('students')
      .update({ status: 'Cancelled' })
      .eq('id', id)
    
    if (!error) {
      fetchPendingJobs()
    } else {
      alert("Error cancelling: " + error.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm("PERMANENTLY DELETE this student? (Cannot be undone - use for full refunds)")) return
    
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)
    
    if (!error) {
      fetchPendingJobs()
    } else {
      alert("Error deleting: " + error.message)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans text-blue-950">
      <div className="max-w-6xl mx-auto">
        
        {/* Header section layout */}
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter italic">Pending Job Control</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Active queue operational management</p>
          </div>
          <Link href="/manager" className="px-6 py-2.5 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase hover:bg-slate-100 transition-all shadow-sm">
            ← Back Dashboard
          </Link>
        </header>

        {/* Central Operations Panel container */}
        <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-blue-950 text-white text-[10px] font-black uppercase tracking-widest border-b border-blue-950">
                  <th className="p-6 pl-8">Student Particulars</th>
                  <th className="p-6">Execution Status</th>
                  <th className="p-6">Amount Collected</th>
                  <th className="p-6 pr-8 text-right">Administrative Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-24 text-center font-black text-slate-300 uppercase text-[10px] tracking-[0.3em] animate-pulse">
                      Loading Operations Queue...
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-24 text-center text-slate-300 font-black uppercase text-[10px] tracking-[0.3em]">
                      No pending execution assignments found
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-6 pl-8">
                        <p className="font-black text-blue-950 uppercase text-lg tracking-tight">{job.full_name}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase">Profile: {job.jamb_profile_code || 'N/A'}</p>
                      </td>
                      <td className="p-6">
                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          job.status === 'Started' 
                            ? 'bg-green-100 text-green-700 animate-pulse border border-green-200' 
                            : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}>
                          {job.status === 'Started' ? '⚡ In Progress' : 'Awaiting Service'}
                        </span>
                      </td>
                      <td className="p-6 font-black text-blue-900 text-base">
                        ₦{Number(job.amount_paid || 0).toLocaleString()}
                      </td>
                      <td className="p-6 pr-8 text-right">
                        <div className="flex justify-end gap-2">
                          
                          {/* NEW ACTION CONTROL: CONDITIONAL DROP TASK BUTTON */}
                          {/* Only allow dropping tasks that have already been selected ('Started') by a staff member */}
                          <button
                            disabled={job.status !== 'Started'}
                            onClick={() => handleDropTask(job.id)}
                            className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-wider border transition-all shadow-sm ${
                              job.status === 'Started'
                                ? 'bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-600 hover:text-white'
                                : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                            }`}
                          >
                            Drop Task
                          </button>

                          <button 
                            onClick={() => handleCancel(job.id)}
                            className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl font-black text-[9px] uppercase tracking-wider hover:bg-amber-600 hover:text-white transition-all shadow-sm"
                          >
                            Cancel
                          </button>
                          
                          <button 
                            onClick={() => handleDelete(job.id)}
                            className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl font-black text-[9px] uppercase tracking-wider hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
      </div>
    </div>
  )
}