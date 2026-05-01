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
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (profile?.role !== 'Manager' && profile?.role !== 'Admin') router.push('/dashboard')
  }

  const fetchPendingJobs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, jamb_profile_code, amount_paid, created_at')
      .eq('status', 'Paid')
      .order('created_at', { ascending: false })

    if (!error) setJobs(data)
    setLoading(false)
  }

  const handleCancel = async (id) => {
    if (!confirm("Set this job to 'Cancelled'? (Record stays in database)")) return
    const { error } = await supabase
      .from('students')
      .update({ status: 'Cancelled' })
      .eq('id', id)
    
    if (!error) fetchPendingJobs()
    else alert("Error cancelling: " + error.message)
  }

  const handleDelete = async (id) => {
    if (!confirm("PERMANENTLY DELETE this student? (Cannot be undone - use for full refunds)")) return
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)
    
    if (!error) fetchPendingJobs()
    else alert("Error deleting: " + error.message)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Pending Job Control</h1>
            <Link href="/manager" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">← Back to Dashboard</Link>
          </div>
        </header>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white">
              <tr className="text-[10px] font-black uppercase tracking-widest">
                <th className="p-6">Student Name</th>
                <th className="p-6">Profile Code</th>
                <th className="p-6">Amount</th>
                <th className="p-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="4" className="p-10 text-center font-bold text-slate-400">Loading Queue...</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan="4" className="p-10 text-center text-slate-400 italic">No pending jobs found.</td></tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 font-bold text-slate-800">{job.full_name}</td>
                    <td className="p-6 text-slate-500 font-mono text-xs">{job.jamb_profile_code}</td>
                    <td className="p-6 font-bold text-blue-900">₦{Number(job.amount_paid).toLocaleString()}</td>
                    <td className="p-6 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => handleCancel(job.id)}
                        className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-black text-[9px] uppercase hover:bg-amber-200 transition-all"
                      >
                        Cancel Job
                      </button>
                      <button 
                        onClick={() => handleDelete(job.id)}
                        className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-black text-[9px] uppercase hover:bg-red-600 hover:text-white transition-all"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}