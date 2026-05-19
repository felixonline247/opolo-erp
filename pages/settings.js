import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function Settings() {
  const [services, setServices] = useState([])
  const [staff, setStaff] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editingStaffId, setEditingStaffId] = useState(null) // NEW: Tracks active staff edit row
  
  // SMS Template State
  const [smsTemplate, setSmsTemplate] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const [formData, setFormData] = useState({ 
    service_name: '', 
    price: '', 
    institution_cost: ''
  })

  const [staffData, setStaffData] = useState({ 
    email: '', 
    full_name: '', 
    role: 'Service Staff',
    commission_type: 'fixed',
    commission_value: 0,
    vip_auth_code: '0000'
  })
  
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const initialize = async () => {
      await checkManagerAccess()
      await fetchServices()
      await fetchStaff()
      await fetchSMSTemplate()
      setLoading(false)
    }
    initialize()
  }, [])

  const checkManagerAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (profile?.role !== 'Manager') router.push('/dashboard')
  }

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('*').order('created_at', { ascending: true })
    setServices(data || [])
  }

  const fetchStaff = async () => {
    const { data } = await supabase.from('profiles').select('id, email, full_name, role, commission_type, commission_value, vip_auth_code').order('role', { ascending: true })
    setStaff(data || [])
  }

  const fetchSMSTemplate = async () => {
    const { data } = await supabase.from('settings').select('sms_template').eq('id', 1).single()
    if (data) {
      setSmsTemplate(data.sms_template)
    }
  }

  const handleUpdateTemplate = async () => {
    setSavingTemplate(true)
    const { error } = await supabase
      .from('settings')
      .update({ sms_template: smsTemplate })
      .eq('id', 1)

    if (error) {
      alert("Error saving template: " + error.message)
    } else {
      alert("SMS Template updated successfully!")
    }
    setSavingTemplate(false)
  }

  const handleServiceSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...formData,
      price: parseFloat(formData.price),
      institution_cost: parseFloat(formData.institution_cost) || 0
    }

    if (editingId) {
      await supabase.from('services').update(payload).eq('id', editingId)
    } else {
      await supabase.from('services').insert([payload])
    }
    
    setFormData({ service_name: '', price: '', institution_cost: '' })
    setEditingId(null)
    fetchServices()
  }

  const handleStaffSubmit = async (e) => {
    e.preventDefault()
    
    const payload = { 
      email: staffData.email.toLowerCase().trim(), 
      full_name: staffData.full_name, 
      role: staffData.role,
      commission_type: staffData.commission_type,
      commission_value: parseFloat(staffData.commission_value),
      vip_auth_code: staffData.role === 'Consultant' ? staffData.vip_auth_code.trim() : '0000'
    }

    let error;
    // UPDATED: Dynamic routing logic to handle updates if editingStaffId exists
    if (editingStaffId) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', editingStaffId)
      error = updateError
    } else {
      const { error: insertError } = await supabase
        .from('profiles')
        .insert([payload])
      error = insertError
    }

    if (error) {
      alert("Staff Configuration Save Error: " + error.message)
    } else {
      alert(editingStaffId ? "Staff configuration metrics saved successfully!" : "Staff member successfully pre-registered!");
      clearStaffForm()
      fetchStaff()
    }
  }

  const clearStaffForm = () => {
    setStaffData({ email: '', full_name: '', role: 'Service Staff', commission_type: 'fixed', commission_value: 0, vip_auth_code: '0000' })
    setEditingStaffId(null)
  }

  const deleteService = async (id) => {
    if (confirm("Delete this service?")) {
      await supabase.from('services').delete().eq('id', id)
      fetchServices()
    }
  }

  const removeStaff = async (email) => {
    if (confirm(`Are you sure you want to remove ${email}?`)) {
      const { error } = await supabase.from('profiles').delete().eq('email', email)
      if (error) alert("Error removing staff: " + error.message)
      else fetchStaff()
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-white font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">System Settings</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Opolo CBT Resort Configuration</p>
          </div>
          <Link href="/dashboard" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest">← Back to Command</Link>
        </div>

        {/* SECTION: BROADCAST & COMMUNICATION */}
        <div className="mb-20">
          <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.3em] mb-6 ml-2">Communication Center</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-amber-50 p-8 rounded-[2rem] border border-amber-100 shadow-sm">
              <h2 className="text-xs font-black text-amber-600 uppercase mb-4">Global SMS Alert Template</h2>
              <textarea 
                className="w-full p-4 rounded-xl border-none ring-1 ring-amber-200 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-bold bg-white text-blue-950"
                rows="3"
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                placeholder="Example: Hello {name}, your {service} is ready for pickup at Opolo CBT Resort."
              />
              <div className="flex flex-col mt-4 gap-2">
                <p className="text-[9px] font-black text-amber-500 uppercase">
                  Available Tags: <span className="text-blue-900">{"{name}"}</span>, <span className="text-blue-900">{"{service}"}</span>
                </p>
                <button 
                  onClick={handleUpdateTemplate}
                  disabled={savingTemplate}
                  className="w-full bg-blue-950 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition disabled:opacity-50"
                >
                  {savingTemplate ? 'Saving...' : 'Update Template'}
                </button>
              </div>
            </div>

            <div className="bg-blue-900 p-8 rounded-[2rem] flex flex-col justify-center items-center text-center shadow-xl shadow-blue-900/20">
              <div className="bg-blue-800 p-4 rounded-full mb-4">
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.167a2.405 2.405 0 010-1.341l2.147-6.167a1.76 1.76 0 013.417.592zm4.49 11.03a.5.5 0 00.41.832 7 7 0 005.236-2.486.5.5 0 00-.423-.832 5 5 0 01-5.223 2.486zm0-11.03a.5.5 0 01.41-.832 7 7 0 015.236 2.486.5.5 0 01-.423.832 5 5 0 00-5.223-2.486z" />
                </svg>
              </div>
              <h2 className="text-xs font-black text-white uppercase mb-2">Mass Messaging</h2>
              <p className="text-[9px] font-bold text-blue-300 uppercase mb-6 leading-relaxed">Send bulk alerts to filtered students</p>
              <Link href="/broadcast" className="w-full bg-blue-500 hover:bg-white hover:text-blue-950 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">
                Open Broadcast
              </Link>
            </div>
          </div>
        </div>

        {/* SECTION 2: SERVICES MANAGEMENT */}
        <div className="mb-20">
          <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.3em] mb-6 ml-2">Service & Price Configuration</h3>
          <div className="bg-slate-50 p-8 rounded-[2rem] mb-8 border border-slate-100 shadow-sm">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-6">{editingId ? 'Edit Existing Service' : 'Add New Registration Service'}</h2>
            <form onSubmit={handleServiceSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className="p-4 rounded-xl border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" placeholder="Service Name (e.g., JAMB UTME)" value={formData.service_name} onChange={(e) => setFormData({...formData, service_name: e.target.value})} required />
              <input type="number" className="p-4 rounded-xl border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" placeholder="Total Price to Student (₦)" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} required />
              <div className="md:col-span-2">
                <label className="block text-[9px] font-black text-red-500 uppercase mb-1 ml-1">Institutional Cost (Non-Profit Pass-through)</label>
                <input type="number" className="w-full p-4 rounded-xl border-none ring-1 ring-red-100 bg-red-50/30 focus:ring-2 focus:ring-red-400 outline-none text-sm font-bold text-red-900 placeholder-red-300" placeholder="Amount paid to JAMB/University (₦)" value={formData.institution_cost} onChange={(e) => setFormData({...formData, institution_cost: e.target.value})} required />
              </div>
              <div className="md:col-span-2 flex gap-2 mt-2">
                <button type="submit" className="flex-1 bg-blue-900 text-white p-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black transition">{editingId ? 'Save Changes' : 'Create Service'}</button>
                {editingId && <button onClick={() => {setEditingId(null); setFormData({service_name: '', price: '', institution_cost: ''})}} className="bg-slate-200 text-slate-600 px-6 rounded-xl font-black text-xs uppercase">Cancel</button>}
              </div>
            </form>
          </div>
          
          <div className="space-y-3">
            {services.map(s => (
              <div key={s.id} className="flex justify-between items-center p-6 bg-white border border-slate-100 rounded-2xl hover:shadow-md transition-shadow">
                <div>
                  <p className="font-black text-blue-950 uppercase text-sm">{s.service_name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">₦{s.price?.toLocaleString()} Student Fee • <span className="text-red-400 ml-1">₦{s.institution_cost?.toLocaleString()} Inst. Cost</span></p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => {setEditingId(s.id); setFormData({ service_name: s.service_name, price: s.price, institution_cost: s.institution_cost }); }} className="text-[10px] font-black text-blue-600 uppercase hover:underline">Edit</button>
                  <button onClick={() => deleteService(s.id)} className="text-[10px] font-black text-red-500 uppercase hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 3: STAFF MANAGEMENT */}
        <div className="mb-12">
          <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-[0.3em] mb-6 ml-2">Staff & User Permissions</h3>
          <div className="bg-blue-950 p-8 rounded-[2rem] mb-8 shadow-xl shadow-blue-900/20">
            {/* UPDATED HEADER: Changes depending on editing state */}
            <h2 className="text-xs font-black text-blue-300 uppercase mb-6">
              {editingStaffId ? `Edit Personnel Settings: ${staffData.full_name}` : 'Register New Personnel with Commission'}
            </h2>
            <form onSubmit={handleStaffSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className="p-4 rounded-xl border-none outline-none text-sm font-bold bg-blue-900 text-white placeholder-blue-400" placeholder="Full Name" value={staffData.full_name} onChange={(e) => setStaffData({...staffData, full_name: e.target.value})} required />
              <input type="email" className="p-4 rounded-xl border-none outline-none text-sm font-bold bg-blue-900 text-white placeholder-blue-400" placeholder="Staff Email Address" value={staffData.email} onChange={(e) => setStaffData({...staffData, email: e.target.value})} required />
              
              <div className="bg-blue-900 p-4 rounded-xl flex flex-col gap-2">
                <label className="text-[8px] font-black text-blue-300 uppercase">Pay Structure</label>
                <select className="bg-transparent border-none outline-none text-sm font-bold text-white w-full" value={staffData.commission_type} onChange={(e) => setStaffData({...staffData, commission_type: e.target.value})}>
                  <option value="fixed" className="bg-blue-950">Fixed Commission (₦)</option>
                  <option value="percentage" className="bg-blue-950">Percentage (%)</option>
                </select>
              </div>

              <div className="bg-blue-900 p-4 rounded-xl flex flex-col gap-2">
                <label className="text-[8px] font-black text-blue-300 uppercase">Commission Amount/Rate</label>
                <input type="number" className="bg-transparent border-none outline-none text-sm font-bold text-white placeholder-blue-400 w-full" placeholder="Value (e.g. 500 or 10)" value={staffData.commission_value} onChange={(e) => setStaffData({...staffData, commission_value: e.target.value})} required />
              </div>

              <div className="flex flex-col gap-1 md:col-span-1">
                <select className="w-full p-4 rounded-xl border-none outline-none text-sm font-bold bg-blue-900 text-white" value={staffData.role} onChange={(e) => setStaffData({...staffData, role: e.target.value})}>
                  <option value="Front Desk">Front Desk</option>
                  <option value="Service Staff">Service Staff</option>
                  <option value="Account">Account Officer</option>
                  <option value="Consultant">Consultant (VIP)</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>

              {staffData.role === 'Consultant' && (
                <div className="bg-purple-900 p-4 rounded-xl flex flex-col gap-2 md:col-span-1 border border-purple-400 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[8px] font-black text-purple-200 uppercase tracking-wider">Consultant Authorization PIN</label>
                  <input 
                    type="text" 
                    maxLength="6"
                    className="bg-transparent border-none outline-none text-sm font-black text-white placeholder-purple-400 w-full tracking-widest" 
                    placeholder="Enter PIN (e.g. 1234)" 
                    value={staffData.vip_auth_code} 
                    onChange={(e) => setStaffData({...staffData, vip_auth_code: e.target.value})} 
                    required={staffData.role === 'Consultant'} 
                  />
                </div>
              )}

              {/* UPDATED BUTTON ACTIONS: Handles changes cleanly */}
              <div className="md:col-span-2 flex gap-2 mt-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white p-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white hover:text-blue-950 transition">
                  {editingStaffId ? 'Save Personnel Changes' : 'Register Staff'}
                </button>
                {editingStaffId && (
                  <button type="button" onClick={clearStaffForm} className="bg-blue-900 border border-blue-400 text-blue-200 px-6 rounded-xl font-black text-xs uppercase hover:bg-red-500 hover:text-white transition-all">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {staff.map((member, idx) => (
              <div key={member.id || `staff-${idx}`} className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center">
                <div className="overflow-hidden">
                  <p className="font-black text-blue-950 uppercase text-xs truncate">{member.full_name || 'Awaiting Signup'}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">{member.email}</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={`text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${member.role === 'Manager' ? 'bg-blue-900 text-white' : member.role === 'Consultant' ? 'bg-purple-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {member.role}
                    </span>
                    <span className="text-[8px] font-black text-blue-600 uppercase">
                      {member.commission_type === 'percentage' ? `${member.commission_value}%` : `₦${member.commission_value?.toLocaleString()}`} Comm.
                    </span>
                    
                    {member.role === 'Consultant' && (
                      <span className="text-[8px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md uppercase tracking-wider border border-purple-200">
                        🔑 PIN: {member.vip_auth_code || '0000'}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* UPDATED LAYOUT CARD LINKS: Pulls profile object parameters back up to layout forms */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                    onClick={() => {
                      setEditingStaffId(member.id);
                      setStaffData({
                        email: member.email,
                        full_name: member.full_name || '',
                        role: member.role || 'Service Staff',
                        commission_type: member.commission_type || 'fixed',
                        commission_value: member.commission_value || 0,
                        vip_auth_code: member.vip_auth_code || '0000'
                      });
                    }}
                    className="text-[10px] font-black text-blue-600 uppercase hover:underline p-1"
                  >
                    Edit
                  </button>
                  <span className="text-slate-300 text-xs font-black">|</span>
                  <button onClick={() => removeStaff(member.email)} className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase p-1">
                    Remove
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}