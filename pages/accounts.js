import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function AccountsDashboard() {
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [pendingStudents, setPendingStudents] = useState([])
  const [stats, setStats] = useState({ revenue: 0, commissions: 0, remittance: 0 })
  const router = useRouter()

  useEffect(() => {
    const initializePage = async () => {
      await checkAccountAccess()
      await fetchPendingData()
      await fetchFinanceStats()
      setLoading(false)
    }
    initializePage()
  }, [])

  const checkAccountAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single()

      if (error || (profile?.role !== 'Account' && profile?.role !== 'Manager')) {
        router.push('/dashboard')
      } else {
        setUserName(profile.full_name)
      }
    } catch (err) {
      console.error("Access Check Error:", err)
    }
  }

  const fetchPendingData = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id, 
          full_name, 
          amount_paid, 
          jamb_profile_code,
          service_id,
          institution_cost,
          services (service_name)
        `)
        .eq('status', 'Pending')
        .order('created_at', { ascending: true })

      if (error) throw error
      setPendingStudents(data || [])
    } catch (err) {
      alert("Error loading pending list: " + err.message)
    }
  }

  const fetchFinanceStats = async () => {
    try {
      // UPDATED: Selecting direct columns from students table
      const { data, error } = await supabase
        .from('students')
        .select(`
          amount_paid, 
          institution_cost, 
          staff_commission,
          status
        `)
        .or('status.eq.Paid,status.eq.Completed')

      if (error) throw error
      
      if (data) {
        let totalRev = 0; let totalRemit = 0; let totalComm = 0;

        data.forEach(item => {
          const paid = Number(item.amount_paid) || 0
          const inst = Number(item.institution_cost) || 0
          const comm = Number(item.staff_commission) || 0
          
          // Total Revenue for the Resort = amount_paid - institution_cost
          totalRev += (paid - inst) 
          totalRemit += inst
          totalComm += comm
        })
        setStats({ revenue: totalRev, remittance: totalRemit, commissions: totalComm })
      }
    } catch (err) {
      console.error("Stats Error:", err.message)
    }
  }

  const confirmPayment = async (studentId, method, instCost) => {
    const isConfirmed = window.confirm(`Confirm ${method} payment for this student?`);
    if (!isConfirmed) return;

    try {
      const { error } = await supabase
        .from('students')
        .update({ 
          status: 'Paid', 
          payment_method: method,
          // We keep the institution_cost already saved by Front Desk
          payment_confirmed_at: new Date().toISOString() 
        })
        .eq('id', studentId)

      if (error) {
        console.error("Database Save Error:", error.message);
        alert("Failed to save to database: " + error.message);
        return;
      }
      
      setPendingStudents(prev => prev.filter(s => s.id !== studentId))
      await fetchFinanceStats()
      
    } catch (err) {
      alert("Critical System Error: " + err.message)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 uppercase font-black text-blue-900 tracking-widest animate-pulse">
      Loading Finance Hub...
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-2xl font-black text-blue-950 uppercase tracking-tighter">Finance Ledger</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{userName} • Account Officer</p>
          </div>
          <button 
            onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
            className="px-6 py-2 border-2 border-red-100 text-red-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
          >
            Logout
          </button>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-blue-900 p-8 rounded-[2rem] text-white shadow-xl shadow-blue-900/20">
            <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mb-2">Net Resort Revenue</p>
            <h2 className="text-3xl font-black text-white">₦{stats.revenue.toLocaleString()}</h2>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Commissions</p>
            <h2 className="text-3xl font-black text-blue-950">₦{stats.commissions.toLocaleString()}</h2>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">Total Remittance</p>
            <h2 className="text-3xl font-black text-red-600">₦{stats.remittance.toLocaleString()}</h2>
          </div>
        </div>

        {/* PENDING LIST */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-blue-950 uppercase text-xs tracking-[0.2em]">Awaiting Verification ({pendingStudents.length})</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingStudents.map(student => (
              <div key={student.id} className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 hover:bg-slate-50/50 transition-colors">
                <div className="flex-1">
                  <p className="font-black text-blue-950 uppercase text-lg leading-tight">{student.full_name}</p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase mt-1">
                    {student.services?.service_name} • ₦{student.amount_paid?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  {['Cash', 'Transfer', 'Card'].map(method => (
                    <button
                      key={method}
                      onClick={() => confirmPayment(student.id, method, student.institution_cost || 0)}
                      className="flex-1 md:flex-none px-6 py-4 bg-white border-2 border-slate-100 hover:border-blue-900 hover:bg-blue-900 hover:text-white text-blue-950 text-[10px] font-black rounded-2xl transition-all uppercase tracking-widest active:scale-95"
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {pendingStudents.length === 0 && (
              <div className="p-20 text-center">
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">No pending payments found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}