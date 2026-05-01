import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import RegistrationForm from '../components/RegistrationForm'
import { sendCompletionSMS } from '../lib/sms'
import { logActivity } from '../lib/logger' // Added for Activity Tracking

export default function Dashboard() {
  const [students, setStudents] = useState([])
  const [services, setServices] = useState([])
  const [userRole, setUserRole] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDate, setFilterDate] = useState('today')
  const router = useRouter()

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 30

  useEffect(() => {
    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      setUserEmail(session.user.email)
      
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      
      const role = profile?.role || 'Front Desk'
      setUserRole(role)
      fetchData(role)
    }
    setup()
  }, [])

  const fetchData = async (role) => {
    setLoading(true)
    const { data: srv } = await supabase.from('services').select('*')
    setServices(srv || [])

    let query = supabase.from('students').select(`*, services(service_name, price, commission_type, commission_value)`)

    if (role === 'Account Officer') {
      query = query.eq('status', 'Awaiting Payment')
    } else if (role === 'Service Staff') {
      query = query.eq('status', 'Awaiting Service')
    }

    const { data: stus, error } = await query.order('created_at', { ascending: false })
    if (!error) setStudents(stus)
    setLoading(false)
  }

  // --- ACTIONS ---

  const handleConfirmPayment = async (student, method) => {
    const { error } = await supabase
      .from('students')
      .update({ 
        status: 'Awaiting Service', 
        payment_method: method,
        account_officer_email: userEmail 
      })
      .eq('id', student.id)
    
    if (!error) {
      // LOG THE ACTIVITY: Payment Confirmation
      await logActivity("Payment", `Confirmed ${method} payment for ${student.full_name}`);
      fetchData(userRole);
    }
  }

  const handleMarkDone = async (student) => {
    const svc = student.services;
    let commission = 0;
    if (svc?.commission_type === 'fixed') {
      commission = svc.commission_value;
    } else if (svc?.commission_type === 'percentage') {
      commission = (svc.price * svc.commission_value) / 100;
    }

    const { error } = await supabase
      .from('students')
      .update({ 
        status: 'Completed', 
        service_staff_email: userEmail,
        commission_earned: commission,
        completed_at: new Date()
      })
      .eq('id', student.id)
    
    if (!error) {
      // LOG THE ACTIVITY: Job Completion
      await logActivity("Service", `Completed service for ${student.full_name}. Commission: ₦${commission}`);
      
      fetchData(userRole)
      try { await sendCompletionSMS(student.phone_number, student.full_name); } 
      catch (e) { console.error("SMS Error:", e); }
    }
  }

  // Filter Logic
  const filteredStudents = students.filter(student => {
    const searchStr = searchTerm.toLowerCase();
    const matchesSearch = (
      student.full_name?.toLowerCase().includes(searchStr) ||
      student.phone_number?.includes(searchStr) ||
      student.jamb_profile_code?.toLowerCase().includes(searchStr)
    );

    if (filterDate === 'all') return matchesSearch;
    const today = new Date().toISOString().split('T')[0];
    const studentDate = new Date(student.created_at).toISOString().split('T')[0];
    return matchesSearch && (studentDate === today);
  })

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  if (loading && !students.length) return <div className="p-20 text-center font-black text-blue-900 uppercase">Opolo ERP Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50 py-10 font-sans px-4">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-blue-950">Opolo CBT Resort</h1>
            <p className="text-blue-600 text-[10px] font-black uppercase mt-1">
              Active: <span className="bg-blue-100 px-2 py-0.5 rounded">{userRole}</span> • {userEmail}
            </p>
          </div>
          <button 
            onClick={async () => {
              await logActivity("Logout", "Staff manually signed out");
              supabase.auth.signOut().then(() => router.push('/'));
            }} 
            className="text-xs font-black text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl border border-red-100 transition"
          >
            LOGOUT
          </button>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Queue Length</p>
            <p className="text-3xl font-black text-slate-800">{filteredStudents.length}</p>
          </div>
          
          {userRole === 'Service Staff' ? (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 bg-green-50/30">
              <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest">Your Commission</p>
              <p className="text-3xl font-black text-green-700">₦{students.reduce((acc, curr) => acc + (curr.commission_earned || 0), 0).toLocaleString()}</p>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest">Awaiting Service</p>
              <p className="text-3xl font-black text-yellow-600">{students.filter(s => s.status === 'Awaiting Service').length}</p>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 bg-gradient-to-br from-white to-blue-50">
            <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Revenue</p>
            <p className="text-3xl font-black text-blue-900">
              {userRole === 'Manager' ? `₦${students.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + (curr.services?.price || 0), 0).toLocaleString()}` : '••••••'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {(userRole === 'Front Desk' || userRole === 'Manager') && (
            <div className="lg:col-span-4">
               <RegistrationForm services={services} onSelect={() => fetchData(userRole)} />
            </div>
          )}

          <div className={(userRole === 'Front Desk' || userRole === 'Manager') ? "lg:col-span-8" : "lg:col-span-12"}>
            <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
              <div className="p-4 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-gray-200 p-1 rounded-xl">
                  <button onClick={() => setFilterDate('today')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition ${filterDate === 'today' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500'}`}>TODAY</button>
                  <button onClick={() => setFilterDate('all')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition ${filterDate === 'all' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500'}`}>ALL RECORDS</button>
                </div>
                <input 
                  type="text" placeholder="Search student name..."
                  className="block w-full md:w-64 px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase bg-slate-50 text-slate-400 font-black tracking-widest">
                      <th className="p-5">Student / Stage</th>
                      <th className="p-5">Service Info</th>
                      <th className="p-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {currentItems.map((student) => (
                      <tr key={student.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="p-5">
                          <div className="font-black text-slate-800 uppercase text-xs">{student.full_name}</div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                            STATUS: <span className="text-blue-600">{student.status}</span>
                          </div>
                        </td>
                        <td className="p-5">
                          <div className="text-xs font-bold text-slate-700">{student.services?.service_name || 'General'}</div>
                          <div className="text-[10px] text-slate-400">₦{student.services?.price || '0'} • {student.payment_method || 'Unpaid'}</div>
                        </td>
                        <td className="p-5 text-right">
                          {userRole === 'Account Officer' && student.status === 'Awaiting Payment' && (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => handleConfirmPayment(student, 'Cash')} className="bg-green-600 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm">CASH</button>
                              <button onClick={() => handleConfirmPayment(student, 'Transfer')} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm">TRANSFER</button>
                            </div>
                          )}

                          {userRole === 'Service Staff' && student.status === 'Awaiting Service' && (
                            <button onClick={() => handleMarkDone(student)} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black shadow-lg">MARK COMPLETED</button>
                          )}

                          {student.status === 'Completed' && (
                            <span className="text-green-600 font-black text-[10px] bg-green-50 px-3 py-1 rounded-full border border-green-100">JOB FINISHED</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="p-5 bg-slate-50 border-t flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-400">PAGE {currentPage} / {totalPages}</p>
                  <div className="flex gap-2">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-2 text-[10px] font-black rounded-xl border bg-white disabled:opacity-30">PREV</button>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 text-[10px] font-black rounded-xl border bg-white disabled:opacity-30">NEXT</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}