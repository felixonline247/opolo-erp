import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AdminPanel() {
  const [services, setServices] = useState([])
  const [newService, setNewService] = useState({
    service_name: '',
    price: '',
    commission_type: 'fixed',
    commission_value: ''
  })

  useEffect(() => { fetchServices() }, [])

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('*')
    setServices(data || [])
  }

  const handleAddService = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('services').insert([newService])
    if (!error) {
      setNewService({ service_name: '', price: '', commission_type: 'fixed', commission_value: '' })
      fetchServices()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-black text-blue-900 mb-8 uppercase tracking-tight">Manager: Service & Commission Setup</h1>
        
        {/* Create Service Form */}
        <form onSubmit={handleAddService} className="bg-white p-6 rounded-2xl shadow-sm border mb-10 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase">Service Name</label>
            <input 
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none" 
              placeholder="e.g. JAMB Registration"
              value={newService.service_name}
              onChange={(e) => setNewService({...newService, service_name: e.target.value})}
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase">Price (₦)</label>
            <input 
              type="number"
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none" 
              placeholder="700"
              value={newService.price}
              onChange={(e) => setNewService({...newService, price: e.target.value})}
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase">Commission Type</label>
            <select 
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none"
              value={newService.commission_type}
              onChange={(e) => setNewService({...newService, commission_type: e.target.value})}
            >
              <option value="fixed">Fixed (₦)</option>
              <option value="percentage">Percentage (%)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase">Staff Commission Value</label>
            <input 
              type="number"
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none" 
              placeholder="e.g. 100"
              value={newService.commission_value}
              onChange={(e) => setNewService({...newService, commission_value: e.target.value})}
            />
          </div>
          <button className="col-span-2 bg-blue-900 text-white font-black py-4 rounded-xl">ADD NEW SERVICE</button>
        </form>

        {/* Existing Services List */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white text-[10px] uppercase font-bold">
              <tr>
                <th className="p-4">Service</th>
                <th className="p-4">Price</th>
                <th className="p-4">Commission</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {services.map(s => (
                <tr key={s.id} className="text-sm">
                  <td className="p-4 font-bold text-slate-800">{s.service_name}</td>
                  <td className="p-4">₦{s.price}</td>
                  <td className="p-4">{s.commission_type === 'fixed' ? `₦${s.commission_value}` : `${s.commission_value}%`}</td>
                  <td className="p-4 text-right">
                    <button onClick={async () => {
                      await supabase.from('services').delete().eq('id', s.id)
                      fetchServices()
                    }} className="text-red-500 font-bold">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}