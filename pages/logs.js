import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState('total') // 'today', 'weekly', 'monthly', 'total', 'custom'
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0])
  const router = useRouter()

  useEffect(() => {
    checkAccess()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [filterMode, customDate])

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    // Only Managers or Admins should see security logs
    if (profile?.role !== 'Manager' && profile?.role !== 'Admin') {
      router.push('/dashboard')
    } else {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply Date Filtering Logic
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

      const { data, error } = await query.limit(200) // Increased limit for management review
      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error("Log Fetch Error:", err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2">
               <Link href="/manager" className="text-blue-900 hover:text-black transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="Details12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
               </Link>
               <h1 className="text-4xl font-black text-blue-950 uppercase tracking-tighter">Audit Logs</h1>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-8">Opolo CBT Resort • System Integrity Tracking</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Toggle Group */}
            <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
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
              onClick={fetchLogs} 
              disabled={loading}
              className="bg-white border border-slate-200 p-3 rounded-2xl hover:bg-slate-100 transition shadow-sm disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-blue-900 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </header>

        {/* Logs Table */}
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-blue-950 text-white text-[10px] uppercase tracking-[0.2em] font-black">
                <tr>
                  <th className="p-8">Timestamp</th>
                  <th className="p-8">Staff Member</th>
                  <th className="p-8">Access Level</th>
                  <th className="p-8">Action Taken</th>
                  <th className="p-8 text-right">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-medium">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="p-8 text-slate-400 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleString('en-GB', { hour12: true })}
                      </td>
                      <td className="p-8">
                        <div className="flex flex-col">
                          <span className="text-blue-950 font-black uppercase text-xs">{log.user_email.split('@')[0]}</span>
                          <span className="text-[10px] text-slate-400">{log.user_email}</span>
                        </div>
                      </td>
                      <td className="p-8">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                          log.role === 'Admin' || log.role === 'Manager' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {log.role}
                        </span>
                      </td>
                      <td className="p-8">
                        <span className="font-black text-blue-900 uppercase text-[11px] tracking-tight">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-8 text-slate-500 italic text-[12px] text-right">
                        {log.details}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest">
                      No activity logs found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Summary */}
        <div className="mt-8 flex justify-end">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-6 py-2 rounded-full border border-slate-200 shadow-sm">
            Total Records: {logs.length}
          </p>
        </div>
      </div>
    </div>
  )
}