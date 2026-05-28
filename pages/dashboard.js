import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import RegistrationForm from '../components/RegistrationForm'
import { sendCompletionSMS } from '../lib/sms'
import { logActivity } from '../lib/logger'
import StaffChat from '../components/StaffChat'

export default function Dashboard() {
  const [students, setStudents] = useState([])
  const [services, setServices] = useState([])
  const [userRole, setUserRole] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [userProfile, setUserProfile] = useState({ id: null, name: '', email: '', commission_type: 'fixed', commission_value: 0 })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDate, setFilterDate] = useState('today')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 30

  useEffect(() => {
    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')
      
      setUserEmail(session.user.email)
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, commission_type, commission_value')
        .eq('id', session.user.id)
        .single()
      
      const role = profile?.role || 'Front Desk'
      
      // NEW: Secure cross-routing gatekeeper redirection rule
      if (role === 'Partner Agent') {
        return router.push('/business-center')
      }

      setUserRole(role)
      setUserProfile({
        id: session.user.id,
        name: profile?.full_name || 'Staff Member',
        email: profile?.email || session.user.email,
        commission_type: profile?.commission_type || 'fixed',
        commission_value: Number(profile?.commission_value || 0)
      })
      fetchData(role)
    }
    setup()
  }, [])

  const fetchData = async (role) => {
    setLoading(true)
    
    // Fetch services for dropdowns
    const { data: srv } = await supabase.from('services').select('*')
    setServices(srv || [])

    // UPDATED: Included registration_source to isolate third-party agent records
    let query = supabase.from('students').select(`
      *, 
      services(service_name, price, commission_type, commission_value)
    `)

    // Role-based status filtering
    if (role === 'Account Officer' || role === 'Account') {
      query = query.eq('status', 'Awaiting Payment')
    } else if (role === 'Service Staff') {
      query = query.eq('status', 'Awaiting Service')
    }

    const { data: stus, error } = await query
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    
    if (!error) {
      setStudents(stus)
    } else {
      console.error("Supabase Fetch Error:", error)
    }
    setLoading(false)
  }

  // --- ACTIONS ---

  const handleConfirmPayment = async (student, method) => {
    const { error } = await supabase
      .from('students')
      .update({ 
        status: 'Awaiting Service', 
        payment_method: method,
        account_officer_email: userEmail,
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', student.id)
    
    if (!error) {
      await logActivity("Payment", `Confirmed ${method} payment for ${student.full_name}`);
      fetchData(userRole);
    }
  }

  const handleMarkDone = async (student) => {
    const paid = Number(student.amount_paid) || 0;
    const inst = Number(student.institution_cost) || 0;
    const netProfit = paid - inst;

    let calculatedComm = 0;
    let consultantComm = 0;

    if (student.assigned_consultant_id) {
      const staffType = userProfile.commission_type?.toLowerCase();
      const staffVal = Number(userProfile.commission_value) || 0;

      if (staffType === 'percentage') {
        calculatedComm = netProfit * (staffVal / 100);
      } else {
        calculatedComm = staffVal;
      }

      const { data: consultantProfile } = await supabase
        .from('profiles')
        .select('commission_type, commission_value')
        .eq('id', student.assigned_consultant_id)
        .single();

      if (consultantProfile) {
        const consulType = consultantProfile.commission_type?.toLowerCase();
        const consulVal = Number(consultantProfile.commission_value) || 0;
        consultantComm = consulType === 'percentage' ? (netProfit * (consulVal / 100)) : consulVal;
      }
    } else {
      const staffType = userProfile.commission_type?.toLowerCase();
      const staffVal = Number(userProfile.commission_value) || 0;

      if (staffType === 'percentage') {
        calculatedComm = netProfit * (staffVal / 100);
      } else {
        calculatedComm = staffVal;
      }
      consultantComm = 0;
    }

    const { error } = await supabase
      .from('students')
      .update({ 
        status: 'Completed', 
        service_staff_email: userEmail,
        staff_commission: calculatedComm, 
        consultant_commission: consultantComm, 
        commission_earned: calculatedComm, 
        completed_at: new Date().toISOString()
      })
      .eq('id', student.id)
    
    if (!error) {
      await logActivity("Service", `Completed service for ${student.full_name}. Staff Commission: ₦${calculatedComm}`);
      fetchData(userRole)
      try { 
        await sendCompletionSMS(student.phone_number, student.full_name); 
      } catch (e) { 
        console.error("SMS Error:", e); 
      }
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
    <div className="min-h-screen bg-gray-50 py-10 font-sans px-4 relative overflow-x-hidden text-blue-950">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Opolo CBT Resort</h1>
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
              <p className="text-3xl font-black text-green-700">₦{students.reduce((acc, curr) => acc + (curr.staff_commission || curr.commission_earned || 0), 0).toLocaleString()}</p>
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
              {['Manager', 'Admin', 'Account'].includes(userRole) ? `₦${students.filter(s => s.status === 'Completed').reduce((acc, curr) => acc + (curr.amount_paid || 0), 0).toLocaleString()}` : '••••••'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {(userRole === 'Front Desk' || userRole === 'Manager' || userRole === 'Admin') && (
            <div className="lg:col-span-4">
               <RegistrationForm services={services} onSelect={() => fetchData(userRole)} />
            </div>
          )}

          <div className={(userRole === 'Front Desk' || userRole === 'Manager' || userRole === 'Admin') ? "lg:col-span-8" : "lg:col-span-12"}>
            <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
              <div className="p-4 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-gray-200 p-1 rounded-xl">
                  <button onClick={() => {setFilterDate('today'); setCurrentPage(1)}} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition ${filterDate === 'today' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500'}`}>TODAY</button>
                  <button onClick={() => {setFilterDate('all'); setCurrentPage(1)}} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition ${filterDate === 'all' ? 'bg-white text-blue-900 shadow-sm' : 'text-gray-500'}`}>ALL RECORDS</button>
                </div>
                <input 
                  type="text" placeholder="Search student name..."
                  className="block w-full md:w-64 px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1)}}
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
                    {currentItems.length > 0 ? currentItems.map((student) => (
                      <tr key={student.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="p-5">
                          <div className="flex items-center gap-2">
                            <div className="font-black text-slate-800 uppercase text-xs tracking-tight">{student.full_name}</div>
                            
                            {/* UPDATED: Renders distinct styling tag if student originates from external B2B desk */}
                            {student.registration_source === 'Business Center' ? (
                              <span className="bg-purple-900 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-sm border border-purple-950 animate-pulse">
                                🏢 Bussiness-Centre
                              </span>
                            ) : student.assigned_consultant_id ? (
                              <span className="bg-purple-100 text-purple-700 text-[8px] font-black uppercase px-2 py-0.5 rounded">VIP</span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase">
                            STATUS: <span className={student.status === 'Completed' ? "text-green-600" : "text-blue-600"}>{student.status}</span>
                          </div>
                        </td>
                        <td className="p-5">
                          <div className="text-xs font-bold text-slate-700">{student.services?.service_name || 'General Service'}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">₦{key = Number(student.amount_paid || student.services?.price || 0).toLocaleString()} • {student.payment_method || 'Unpaid'}</div>
                        </td>
                        <td className="p-5 text-right">
                          {(userRole === 'Account Officer' || userRole === 'Account') && student.status === 'Awaiting Payment' && (
                            <div className="flex gap-2 justify-end">
                              {/* UPDATED: Switches payment triggers for external Paystack automated clearance records */}
                              {student.registration_source === 'Business Center' ? (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Verify cash transaction parameters and approve operational release to Service Staff queue for ${student.full_name}?`)) return
                                    const { error } = await supabase
                                      .from('students')
                                      .update({
                                        status: 'Awaiting Service',
                                        account_officer_email: userEmail,
                                        payment_confirmed_at: new Date().toISOString()
                                      })
                                      .eq('id', student.id)

                                    if (!error) {
                                      await logActivity("B2B Verification", `Approved cash parameters for Business Center entry: ${student.full_name}`);
                                      fetchData(userRole);
                                    }
                                  }}
                                  className="bg-purple-900 hover:bg-black text-white px-5 py-2 rounded-xl text-[10px] font-black shadow-md uppercase tracking-wider transition-all"
                                >
                                  Approve Release
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => handleConfirmPayment(student, 'Cash')} className="bg-green-600 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm uppercase">CASH</button>
                                  <button onClick={() => handleConfirmPayment(student, 'Transfer')} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black shadow-sm uppercase">TRANS</button>
                                </>
                              )}
                            </div>
                          )}

                          {userRole === 'Service Staff' && student.status === 'Awaiting Service' && (
                            <button onClick={() => handleMarkDone(student)} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black shadow-lg uppercase">MARK DONE</button>
                          )}

                          {student.status === 'Completed' && (
                            <span className="text-green-600 font-black text-[10px] bg-green-50 px-3 py-1 rounded-full border border-green-100 uppercase italic">SUCCESS</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="3" className="p-10 text-center text-xs font-bold text-slate-300 uppercase tracking-widest italic">No matching records found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="p-5 bg-slate-50 border-t flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase">PAGE {currentPage} / {totalPages}</p>
                  <div className="flex gap-2">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-2 text-[10px] font-black rounded-xl border bg-white disabled:opacity-30 uppercase">PREV</button>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 text-[10px] font-black rounded-xl border bg-white disabled:opacity-30 uppercase">NEXT</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CHAT TOGGLE */}
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
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white"></span>
            </span>
          </div>
        )}
      </button>

      {isChatOpen && (
        <div className="fixed inset-0 bg-blue-950/40 backdrop-blur-sm z-[50]" onClick={() => setIsChatOpen(false)} />
      )}

      <aside className={`fixed top-0 right-0 h-full w-full md:w-[400px] bg-white z-[60] shadow-2xl transition-transform duration-500 ease-in-out transform ${
        isChatOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="h-full flex flex-col pt-8">
          <div className="px-8 flex justify-between items-center mb-4">
             <h2 className="text-xs font-black text-blue-950 uppercase tracking-[0.2em]">Internal Staff Chat</h2>
             <button onClick={() => setIsChatOpen(false)} className="text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest">Close</button>
          </div>
          <div className="flex-1 overflow-hidden">
             <StaffChat currentUser={userProfile} />
          </div>
        </div>
      </aside>

    </div>
  )
}