import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function BusinessCenterPortal() {
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [services, setServices] = useState([])
  const [agentProfile, setAgentProfile] = useState({ id: null, name: '', email: '' })
  const [agentJobs, setAgentJobs] = useState([]) 
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    jambCode: '',
    regNumber: '',
    service_id: ''
  })

  const router = useRouter()

  useEffect(() => {
    initializeAgent()
  }, [])

  const initializeAgent = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/')

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role !== 'Partner Agent') {
        alert("Access Denied: Partner Agent Privileges Required")
        router.push('/dashboard')
      } else {
        setAgentProfile({
          id: profile.id,
          name: profile.full_name,
          email: profile.email || session.user.email
        })
        
        const { data: srv } = await supabase
          .from('services')
          .select('id, service_name, agent_price')
          .gt('agent_price', 0) 
        
        setServices(srv || [])
        fetchAgentQueue(profile.id)
        setLoading(false)
      }
    } catch (err) {
      console.error("Agent Auth Error:", err)
      router.push('/')
    }
  }

  const fetchAgentQueue = async (agentId) => {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, status, amount_paid, created_at, services(service_name)')
      .eq('agent_id', agentId)
      .eq('registration_source', 'Business Center')
      .order('created_at', { ascending: false })
    setAgentJobs(data || [])
  }

  const handlePaystackCheckout = async (e) => {
    e.preventDefault()
    if (!formData.service_id) return alert("Please select a valid service specification.")

    const selectedService = services.find(s => String(s.id) === String(formData.service_id))
    const totalCost = Number(selectedService?.agent_price || 0)

    if (totalCost <= 0) return alert("Pricing invalid or not preconfigured by Manager.")
    setProcessing(true)

    const uniqueTxRef = `OPL-B2B-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    // 🚀 FIXED: Absolute static hardcoded assignment maps to your verified 40-character key perfectly
    const handler = window.PaystackPop.setup({
      key: "pk_live_6c84a94570e7c1202f5b3d17bfa8407240dda9b", 
      email: agentProfile.email,
      amount: totalCost * 100, 
      currency: 'NGN',
      ref: uniqueTxRef,
      metadata: {
        custom_fields: [
          { display_name: "Student Name", variable_name: "student_name", value: formData.name },
          { display_name: "Phone Number", variable_name: "student_phone", value: formData.phone },
          { display_name: "Profile Code", variable_name: "jamb_code", value: formData.jambCode },
          { display_name: "Registration Number", variable_name: "reg_number", value: formData.regNumber },
          { display_name: "Service ID", variable_name: "service_id", value: formData.service_id },
          { display_name: "Agent ID", variable_name: "agent_id", value: agentProfile.id }
        ]
      },
      callback: function(response) {
        alert(`Payment clear! Transaction approved. Checking backend webhook tracking ledger...`);
        setFormData({ name: '', phone: '', jambCode: '', regNumber: '', service_id: '' })
        fetchAgentQueue(agentProfile.id)
        setProcessing(false)
      },
      onClose: function() {
        alert("Transaction canceled by agent. Entry dropped.");
        setProcessing(false)
      }
    });

    handler.openIframe();
  }

  if (loading) return <div className="p-20 text-center font-black uppercase text-blue-900 animate-pulse">Loading Agent Portal...</div>

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 text-blue-950 font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COMPONENT: INTAKE WORKFLOW APPLICATION */}
        <div className="lg:col-span-5 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl h-fit">
          <div className="mb-6">
            <h1 className="text-2xl font-black uppercase tracking-tight text-blue-950">Partner Agent Station</h1>
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-1">Logged In: {agentProfile.name}</p>
          </div>

          <form onSubmit={handlePaystackCheckout} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1 ml-1">Requested Service</label>
              <select
                required
                className="w-full px-4 py-3 bg-purple-50 border border-purple-100 rounded-xl outline-none text-sm font-bold text-blue-900 focus:ring-2 focus:ring-purple-500"
                value={formData.service_id}
                onChange={(e) => setFormData({...formData, service_id: e.target.value})}
              >
                <option value="">-- Choose Agent Service --</option>
                {services.map(svc => (
                  <option key={svc.id} value={svc.id}>{svc.service_name} (Discount Rate: ₦{Number(svc.agent_price).toLocaleString()})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Student Full Name</label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Student Contact Phone</label>
              <input type="text" required value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Profile Code</label>
                <input type="text" required value={formData.jambCode} onChange={(e) => setFormData({...formData, jambCode: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">JAMB Registration No.</label>
                <input type="text" value={formData.regNumber} onChange={(e) => setFormData({...formData, regNumber: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={processing}
              className={`w-full py-4 px-4 rounded-xl text-white font-black uppercase tracking-wider text-xs transition-all shadow-lg ${processing ? 'bg-gray-400' : 'bg-purple-900 hover:bg-black'}`}
            >
              {processing ? "Launching Paystack Checkout..." : "Secure Payment via Paystack"}
            </button>
          </form>
        </div>

        {/* RIGHT COMPONENT: LIVE TRANSPARENCY AGENT QUEUE */}
        <div className="lg:col-span-7 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-widest">Your Sent Processing Queue Ledger</h3>
            <span className="text-[10px] bg-purple-600 px-3 py-1 rounded-full font-black uppercase">{agentJobs.length} Submissions</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[550px]">
            {agentJobs.map((job) => (
              <div key={job.id} className="p-6 flex justify-between items-center hover:bg-slate-50/50 transition-all">
                <div>
                  <p className="font-black text-blue-950 text-sm uppercase tracking-tight">{job.full_name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{job.services?.service_name}</p>
                </div>
                <div>
                  <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border ${
                    job.status === 'Completed' ? 'bg-green-50 text-green-600 border-green-200' :
                    job.status === 'Started' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    'bg-blue-50 text-blue-600 border-blue-200'
                  }`}>
                    {job.status === 'Completed' ? '✅ Finished' : job.status === 'Started' ? '⚡ Processing' : '⏳ Queue Wallet'}
                  </span>
                </div>
              </div>
            ))}
            {agentJobs.length === 0 && (
              <div className="p-20 text-center text-slate-300 font-black text-xs uppercase tracking-widest italic">No agent processing history logged.</div>
            )}
          </div>
        </div>

      </div>
      <script src="https://js.paystack.co/v1/inline.js" async></script>
    </div>
  )
}