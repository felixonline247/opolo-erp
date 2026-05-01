import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function CommissionReport() {
  const [report, setReport] = useState([])
  const [totalPayout, setTotalPayout] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  
  const today = new Date().toISOString().split('T')[0]
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(today)

  useEffect(() => {
    setMounted(true)
    checkManagerAccess()
    fetchCommissionData()
  }, [])

  const checkManagerAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    const allowed = ['Manager', 'Admin', 'Account'];
    if (!allowed.includes(profile?.role)) router.push('/dashboard')
  }

  const fetchCommissionData = async () => {
    setLoading(true)
    try {
      // 1. Fetch completed students with commission
      const { data: jobs, error: jobsError } = await supabase
        .from('students')
        .select('staff_commission, completed_by, completed_at')
        .eq('status', 'Completed')
        .not('completed_by', 'is', null)
        .gte('completed_at', `${startDate}T00:00:00`)
        .lte('completed_at', `${endDate}T23:59:59`)

      if (jobsError) throw jobsError

      if (!jobs || jobs.length === 0) {
        setReport([])
        setTotalPayout(0)
        return
      }

      // 2. Fetch all profiles to map IDs to Names/Emails
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')

      if (profileError) throw profileError

      // 3. Create a lookup map for profiles
      const profileMap = {}
      profiles.forEach(p => { profileMap[p.id] = p })

      // 4. Group and Sum
      const grouped = jobs.reduce((acc, curr) => {
        const staffId = curr.completed_by
        const profile = profileMap[staffId] || { full_name: 'Unknown Staff', email: 'N/A' }
        
        if (!acc[staffId]) {
          acc[staffId] = { 
            name: profile.full_name, 
            email: profile.email, 
            jobs: 0, 
            total: 0 
          }
        }
        acc[staffId].jobs += 1
        acc[staffId].total += Number(curr.staff_commission || 0)
        return acc
      }, {})

      const reportArray = Object.values(grouped)
      setReport(reportArray)
      setTotalPayout(reportArray.reduce((sum, item) => sum + item.total, 0))
      
    } catch (err) {
      console.error("Report System Error:", err.message)
    } finally {
      setLoading(false)
    }
  }

  const exportToCSV = () => {
    const headers = ["Staff Name", "Staff Email", "Jobs Completed", "Total Commission (NGN)"]
    const rows = report.map(staff => [staff.name, staff.email, staff.jobs, staff.total])
    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Opolo_Payouts_${startDate}_to_${endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Staff Payouts</h1>
            <Link href="/manager" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">← Back to Command Center</Link>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col">
              <label className="text-[8px] font-black ml-1 text-slate-400 uppercase">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs font-bold outline-none px-2" />
            </div>
            <div className="h-8 w-px bg-slate-100"></div>
            <div className="flex flex-col">
              <label className="text-[8px] font-black ml-1 text-slate-400 uppercase">To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs font-bold outline-none px-2" />
            </div>
            <button onClick={fetchCommissionData} className="bg-blue-900 text-white px-4 py-2 rounded-xl font-black text-[10px] hover:bg-black transition-all">FILTER</button>
          </div>

          <div className="flex gap-2">
            <button onClick={exportToCSV} className="bg-green-600 text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg shadow-green-900/20">CSV EXCEL</button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg shadow-slate-900/20">PRINT PDF</button>
          </div>
        </div>

        <div className="print:m-0 print:p-0">
          <div className="hidden print:block mb-8 text-center border-b pb-4">
            <h1 className="text-2xl font-black text-blue-950">OPOLO CBT RESORT</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payout Report: {startDate} to {endDate}</p>
          </div>

          <div className="bg-blue-900 rounded-3xl p-8 mb-8 text-white shadow-2xl relative overflow-hidden print:bg-slate-50 print:text-black print:shadow-none print:border print:border-slate-200">
            <div className="relative z-10">
              <p className="text-xs font-bold uppercase opacity-60 tracking-widest print:opacity-100 print:text-slate-500">Total Payable for selected period</p>
              <h2 className="text-5xl font-black mt-2">₦{totalPayout.toLocaleString()}</h2>
            </div>
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-800 rounded-full opacity-50 print:hidden"></div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 print:shadow-none print:border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-white print:bg-slate-100 print:text-slate-900">
                <tr className="text-[10px] font-black uppercase tracking-widest">
                  <th className="p-6">Staff Member</th>
                  <th className="p-6 text-center">Jobs</th>
                  <th className="p-6 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan="3" className="p-10 text-center font-bold text-slate-400 uppercase tracking-tighter animate-pulse">Scanning Database...</td></tr>
                ) : report.length === 0 ? (
                  <tr><td colSpan="3" className="p-10 text-center text-slate-400 italic">No completed jobs found. Tip: Ensure jobs are marked "Completed" in the Service Queue.</td></tr>
                ) : (
                  report.map((staff) => (
                    <tr key={staff.email} className="hover:bg-blue-50/30 transition-colors">
                      <td className="p-6">
                        <p className="font-bold text-slate-800 text-sm uppercase">{staff.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium lowercase tracking-tighter">{staff.email}</p>
                      </td>
                      <td className="p-6 text-center">
                        <span className="font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs">{staff.jobs}</span>
                      </td>
                      <td className="p-6 text-right font-black text-xl text-green-600">₦{staff.total.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <p className="mt-6 text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
          Opolo CBT Resort • Internal Financial Document • Generated: {mounted ? new Date().toLocaleDateString() : '...'}
        </p>
      </div>
    </div>
  )
}