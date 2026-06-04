import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function StudentLedger() {
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [staffProfiles, setStaffProfiles] = useState({}) // 🚀 Stores user id -> full_name map definitions
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [userRole, setUserRole] = useState('')
  
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  const statusOptions = [
    'All',
    'Queue Wallet',
    'Awaiting Payment',
    'Pending',
    'Awaiting Service',
    'Started',
    'Completed',
    'Cancelled'
  ]

  useEffect(() => {
    checkLedgerAccess()
  }, [])

  const checkLedgerAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      const allowedRoles = ['Manager', 'Admin', 'Supervisor']
      if (!allowedRoles.includes(profile?.role)) {
        alert("Access Denied: Administrative or Supervisory clearance required.")
        return router.push('/dashboard')
      }

      setUserRole(profile.role)
      
      // Load staff profiles mapping dictionary first, then fetch student logs
      await fetchStaffProfiles()
      fetchAllStudents()
    } catch (err) {
      console.error("Ledger Authorization Gate Failure:", err)
      router.push('/')
    }
  }

  // 🚀 NEW: Compiles a fast dictionary map of user IDs to full names to avoid strict relational join crashes
  const fetchStaffProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
      
      if (!error && data) {
        const profileMap = {}
        data.forEach(p => {
          profileMap[p.id] = p.full_name || p.email
        })
        setStaffProfiles(profileMap)
      }
    } catch (err) {
      console.error("Error creating staff profiles mapping key dictionary:", err)
    }
  }

  const fetchAllStudents = async () => {
    setLoading(true)
    let allRecords = []
    let keepFetching = true
    let fromOffset = 0
    const chunkSize = 1000

    while (keepFetching) {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          services(service_name)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(fromOffset, fromOffset + chunkSize - 1)

      if (error) {
        console.error("Supabase ledger chunk fetch error:", error)
        keepFetching = false
        break
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data]
        if (data.length < chunkSize) {
          keepFetching = false
        } else {
          fromOffset += chunkSize
        }
      } else {
        keepFetching = false
      }
    }

    setStudents(allRecords)
    setLoading(false)
  }

  const formatDateTime = (isoString) => {
    if (!isoString) return { date: 'N/A', time: 'N/A' }
    const dateObj = new Date(isoString)
    return {
      date: dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  }

  const filteredStudents = students.filter(student => {
    const searchStr = searchTerm.toLowerCase().trim()
    const matchesSearch = (
      student.full_name?.toLowerCase().includes(searchStr) ||
      student.phone_number?.includes(searchStr) ||
      student.jamb_profile_code?.toLowerCase().includes(searchStr)
    )

    const matchesStatus = selectedStatus === 'All' || student.status === selectedStatus

    return matchesSearch && matchesStatus
  })

  const indexOfLastItem = currentPage * itemsPerPage
  const indexOfFirstItem = indexOfLastItem - itemsPerPage
  const currentItems = filteredStudents.slice(indexOfFirstItem, indexOfLastItem)
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage)

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Compiling Complete Student Ledger...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-12 text-blue-950">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER BLOCK */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-6 mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight italic">Central Student Ledger</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Complete database compilation • Role Profile: <span className="text-blue-600 font-black">{userRole}</span>
            </p>
          </div>
          <Link href={userRole === 'Supervisor' ? "/service" : "/dashboard"} className="px-6 py-2.5 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase hover:bg-slate-100 transition-all shadow-sm">
            ← Back to Workstation
          </Link>
        </header>

        {/* CONTROLS SYSTEM */}
        <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-950 shadow-[4px_4px_0px_0px_rgba(26,54,93,1)] mb-8 space-y-4">
          
          {/* SEARCH BAR INPUT */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Search Registry</label>
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Filter by student's name, profile code, or phone number..."
              className="w-full px-4 py-3 bg-slate-50 font-bold border-2 border-blue-950 rounded-xl outline-none focus:bg-blue-50 text-sm text-blue-950"
            />
          </div>

          {/* STATUS TOGGLE BAR */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 ml-1">Filter by Office Status Stage</label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(status => (
                <button
                  key={status}
                  onClick={() => { setSelectedStatus(status); setCurrentPage(1); }}
                  className={`px-4 py-2 border-2 border-blue-950 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    selectedStatus === status 
                      ? 'bg-blue-950 text-white shadow-[2px_2px_0px_0px_rgba(59,130,246,1)]' 
                      : 'bg-white text-blue-950 hover:bg-slate-100'
                  }`}
                >
                  {status === 'All' ? '📁 Show All' : status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LEDGER GRID */}
        <div className="bg-white border-2 border-blue-950 rounded-[2.5rem] shadow-[6px_6px_0px_0px_rgba(26,54,93,1)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-blue-950 text-white text-[10px] font-black uppercase tracking-widest border-b-2 border-blue-950">
                  <th className="p-5 pl-8">Student / Code</th>
                  <th className="p-5">Service Category</th>
                  <th className="p-5">Pipeline Status</th>
                  <th className="p-5">Financial Cost</th>
                  <th className="p-5 pr-8">Operational Fulfillment Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {currentItems.map((student) => {
                  const createdDetails = formatDateTime(student.created_at)
                  const completedDetails = formatDateTime(student.completed_at)
                  
                  // 🚀 FIXED RESOLVER: Resolves completed_by ID -> looks it up inside staffProfiles dictionary mapping link
                  // If no completed_by entry matches, it gracefully falls back to the direct service_staff_email string or 'System'
                  const staffHandlerName = staffProfiles[student.completed_by] || student.service_staff_email || 'System'

                  return (
                    <tr key={student.id} className="hover:bg-blue-50/20 transition-colors">
                      
                      <td className="p-5 pl-8">
                        <p className="font-black text-blue-950 uppercase text-sm tracking-tight">{student.full_name}</p>
                        <p className="text-[9px] font-mono font-bold text-slate-400 uppercase mt-0.5">
                          Code: {student.jamb_profile_code || 'N/A'} • Phone: {student.phone_number}
                        </p>
                      </td>

                      <td className="p-5 font-bold text-slate-800 text-xs uppercase">
                        {student.services?.service_name || 'General Service Routing'}
                      </td>

                      <td className="p-5">
                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          student.status === 'Completed' ? 'bg-green-100 text-green-700 border-green-200' :
                          student.status === 'Awaiting Service' ? 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse' :
                          student.status === 'Started' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                          student.status === 'Cancelled' ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>
                          {student.status}
                        </span>
                      </td>

                      <td className="p-5 text-xs font-mono font-black text-blue-900">
                        <p>Paid: ₦{Number(student.amount_paid || 0).toLocaleString()}</p>
                        <p className="text-red-500 text-[9px] mt-0.5">Inst: ₦{Number(student.institution_cost || 0).toLocaleString()}</p>
                      </td>

                      <td className="p-5 pr-8 text-xs font-bold text-slate-600">
                        {student.status === 'Completed' ? (
                          <div className="space-y-0.5 text-[11px]">
                            <p className="text-green-700 font-black">👨‍💻 Handler: <span className="uppercase text-slate-800">{staffHandlerName}</span></p>
                            <p className="text-slate-400 font-medium">📅 Date: {completedDetails.date} at {completedDetails.time}</p>
                            <p className="text-blue-900 font-black">💰 Comm: ₦{Number(student.staff_commission || 0).toLocaleString()}</p>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 uppercase">
                            <p>Registered Log:</p>
                            <p className="font-mono mt-0.5">{createdDetails.date} • {createdDetails.time}</p>
                          </div>
                        )}
                      </td>

                    </tr>
                  )
                })}

                {currentItems.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-[0.4em] italic">
                      No matching student ledger profiles found in the registry view query parameters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION METRICS BAR */}
          {totalPages > 1 && (
            <div className="p-6 bg-slate-50 border-t-2 border-blue-950 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                VIEWING ROWS {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredStudents.length)} OF {filteredStudents.length} LEDGER ENTRIES
              </p>
              <div className="flex gap-2">
                <button 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-4 py-2 text-[10px] font-black rounded-xl border-2 border-blue-950 bg-white disabled:opacity-30 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] transition-all"
                >
                  PREV
                </button>
                <button 
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-4 py-2 text-[10px] font-black rounded-xl border-2 border-blue-950 bg-white disabled:opacity-30 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(26,54,93,1)] transition-all"
                >
                  NEXT
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}