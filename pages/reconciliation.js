import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function PaymentReconciliation() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [userProfile, setUserProfile] = useState({ role: '', email: '', id: null })
  const [services, setServices] = useState([])
  const [agents, setAgents] = useState([])
  
  const [txRef, setTxRef] = useState('')
  const [message, setMessage] = useState(null)

  // Explicit parameters fallback mapping if Flutterwave payload metadata parameters drop
  const [manualData, setManualData] = useState({
    p_full_name: '',
    p_phone_number: '',
    p_jamb_code: '',
    p_reg_number: '',
    p_service_id: '',
    p_agent_id: ''
  })

  const router = useRouter()

  useEffect(() => {
    checkGatewaySecurity()
  }, [])

  const checkGatewaySecurity = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, email')
        .eq('id', session.user.id)
        .single()

      // 🚀 AUTHENTICATION MATRIX: Restricts clearance explicitly to Managers, Admins, Supervisors, and Partner Agents
      const authorizedRoles = ['Manager', 'Admin', 'Supervisor', 'Partner Agent']
      if (!authorizedRoles.includes(profile?.role)) {
        alert("Access Denied: Administrative Clearance Required.")
        return router.push('/dashboard')
      }

      setUserProfile({ role: profile.role, email: profile.email, id: profile.id })
      
      // Load configuration drop-downs for manual correction recovery bindings
      const { data: srv } = await supabase.from('services').select('id, service_name')
      const { data: agt } = await supabase.from('profiles').select('id, full_name').eq('role', 'Partner Agent')
      
      setServices(srv || [])
      setAgents(agt || [])
      
      // Auto bind the context if a Partner Agent is running self-service reconciliation actions
      if (profile.role === 'Partner Agent') {
        setManualData(prev => ({ ...prev, p_agent_id: profile.id }))
      }

      setLoading(false)
    } catch (err) {
      console.error("Gateway Check Failure:", err)
      router.push('/')
    }
  }

  const handleForceSync = async (e) => {
    e.preventDefault()
    if (!txRef.trim()) return alert("Please submit a valid Flutterwave unique reference code.")
    
    setSyncing(true)
    setMessage(null)

    try {
      const response = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: txRef.trim(),
          student_data: manualData
        })
      })

      const result = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: result.message })
        setTxRef('')
        setManualData({ p_full_name: '', p_phone_number: '', p_jamb_code: '', p_reg_number: '', p_service_id: '', p_agent_id: userProfile.role === 'Partner Agent' ? userProfile.id : '' })
      } else {
        setMessage({ type: 'error', text: result.message })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network processing loop disruption: ' + err.message })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="p-20 text-center font-black text-blue-900 uppercase tracking-widest animate-pulse">Initializing Clearing Terminal...</div>

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans text-blue-950">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        <header className="flex justify-between items-center pb-6 border-b border-slate-200 mb-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight italic">Payment Reconciliation</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Flutterwave Data Recovery Desk • Operator: <span className="text-purple-600 font-black">{userProfile.role}</span>
            </p>
          </div>
          <button onClick={() => router.back()} className="px-5 py-2 border border-slate-200 bg-white hover:bg-slate-50 font-black text-[10px] uppercase rounded-full shadow-sm">
            ← Abort Return
          </button>
        </header>

        {/* CORE FORM WRAPPER */}
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-blue-950 shadow-[6px_6px_0px_0px_rgba(26,54,93,1)]">
          <form onSubmit={handleForceSync} className="space-y-6">
            
            {/* REFERENCE TOKEN FIELD */}
            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
              <label className="block text-[11px] font-black text-blue-950 uppercase tracking-wider mb-2">
                1. Enter Flutterwave Transaction Reference Code (tx_ref)
              </label>
              <input 
                type="text"
                required
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
                placeholder="e.g., OPL-FW-17178553..."
                className="w-full p-4 border-2 border-blue-950 font-mono font-bold text-sm bg-white rounded-xl outline-none uppercase"
              />
              <p className="text-[9px] font-medium text-slate-400 mt-2 lowercase">
                * Paste the exact reference token code from your Flutterwave dashboard transaction statement logs.
              </p>
            </div>

            {/* MANUAL RECOVERY DATA INTAKE SECTION */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">
                2. Fallback Student Attributes (Used only if reference metadata is completely stripped)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Student Full Name</label>
                  <input type="text" value={manualData.p_full_name} onChange={(e) => setManualData({...manualData, p_full_name: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none"/>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Student Contact Phone</label>
                  <input type="text" value={manualData.p_phone_number} onChange={(e) => setManualData({...manualData, p_phone_number: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none"/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">JAMB Profile Code</label>
                  <input type="text" value={manualData.p_jamb_code} onChange={(e) => setManualData({...manualData, p_jamb_code: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none uppercase"/>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">JAMB Registration Number</label>
                  <input type="text" value={manualData.p_reg_number} onChange={(e) => setManualData({...manualData, p_reg_number: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none uppercase"/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Target Service</label>
                  <select value={manualData.p_service_id} onChange={(e) => setManualData({...manualData, p_service_id: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none text-blue-950">
                    <option value="">-- Choose Fallback Service --</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.service_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Attributed Origin Agent</label>
                  <select disabled={userProfile.role === 'Partner Agent'} value={manualData.p_agent_id} onChange={(e) => setManualData({...manualData, p_agent_id: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none disabled:opacity-60 text-blue-950">
                    <option value="">-- Choose Target Agent --</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-wide border ${
                message.type === 'error' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={syncing}
              className={`w-full py-4 rounded-xl text-white font-black text-xs uppercase tracking-widest transition-all ${
                syncing ? 'bg-gray-400 animate-pulse' : 'bg-blue-950 hover:bg-black'
              }`}
            >
              {syncing ? 'Validating Bank Payload Reference...' : '🚀 Force Synchronize To Dashboard'}
            </button>

          </form>
        </div>

      </div>
    </div>
  )
}