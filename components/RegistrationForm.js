import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/logger';

export default function RegistrationForm({ services, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    jambCode: '', 
    regNumber: '',
    service_id: '' 
  });
  const [file, setFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_id) return alert("Please select a service before proceeding.");
    setLoading(true);

    try {
      let documentPath = '';

      // 1. Upload Document if selected
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { data, error: uploadError } = await supabase.storage
          .from('student-docs')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        documentPath = data.path;
      }

      // 2. Get the current staff member and their specific commission profile
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: staffProfile, error: profileError } = await supabase
        .from('profiles')
        .select('commission_type, commission_value')
        .eq('id', user.id)
        .single();

      if (profileError) throw new Error("Could not retrieve your commission profile. Please contact Admin.");

      // 3. Find the selected service details for calculations
      const selectedService = services.find(s => s.id === formData.service_id);
      
      // 4. Calculate Individual Staff Commission
      let calculatedCommission = 0;
      const price = selectedService?.price || 0;
      const instCost = selectedService?.institution_cost || 0;
      const netProfit = price - instCost;

      if (staffProfile.commission_type === 'percentage') {
        // Calculation: (Student Price - Institution Cost) * Staff Percentage
        calculatedCommission = (netProfit * (staffProfile.commission_value / 100));
      } else {
        // Use the fixed Naira amount assigned to this specific staff member
        calculatedCommission = staffProfile.commission_value || 0;
      }

      // 5. Save Data to Supabase
      const { error } = await supabase.from('students').insert([
        { 
          full_name: formData.name, 
          phone_number: formData.phone, 
          jamb_profile_code: formData.jambCode, 
          reg_number: formData.regNumber,
          document_url: documentPath,
          service_id: formData.service_id,
          amount_paid: price, 
          institution_cost: instCost, // Tracks the pass-through cost
          staff_commission: calculatedCommission, // Saves the commission at the time of entry
          status: 'Pending', 
          created_by_email: user?.email 
        }
      ]);

      if (error) throw error;

      // 6. Log activity for the audit trail
      await logActivity("Registration", `Registered student: ${formData.name} (Comm: ₦${calculatedCommission})`);

      alert("Student Registered Successfully! Direct them to the Account Officer.");
      
      // Clear the form
      setFormData({ name: '', phone: '', jambCode: '', regNumber: '', service_id: '' });
      setFile(null);
      
      if (onSelect) onSelect();

    } catch (error) {
      alert("Registration Error: " + error.message);
      console.error("Full error details:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 w-full">
      <h2 className="text-xl font-black text-blue-900 mb-6 border-b pb-2 tracking-tight uppercase">Stage 1: Intake</h2>
      
      <div className="space-y-4">
        {/* Service Selection */}
        <div>
          <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 ml-1">Required Service</label>
          <select
            required
            className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-900 appearance-none"
            value={formData.service_id}
            onChange={(e) => setFormData({...formData, service_id: e.target.value})}
          >
            <option value="">-- Choose Service --</option>
            {services?.map(svc => (
              <option key={svc.id} value={svc.id}>
                {svc.service_name} (₦{svc.price})
              </option>
            ))}
          </select>
        </div>

        <hr className="border-slate-50" />

        {/* ... Rest of the form remains the same as your original UI ... */}
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Full Name</label>
          <input 
            type="text" required
            className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
          <input 
            type="text" required
            className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            placeholder="080..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Profile Code</label>
            <input 
              type="text"
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.jambCode}
              onChange={(e) => setFormData({...formData, jambCode: e.target.value})}
              placeholder="10 digits"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Reg Number</label>
            <input 
              type="text" 
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.regNumber}
              onChange={(e) => setFormData({...formData, regNumber: e.target.value})}
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Document (Slip/JPEG)</label>
          <input 
            type="file" accept="image/*"
            className="mt-1 block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            onChange={(e) => setFile(e.target.files[0])}
          />
        </div>

        <button 
          type="submit" disabled={loading}
          className={`w-full py-4 px-4 rounded-xl text-white font-black transition-all shadow-lg shadow-blue-900/20 uppercase tracking-tighter ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-900 hover:bg-black active:scale-95'}`}
        >
          {loading ? "Processing..." : "Send to Account Office"}
        </button>
      </div>
    </form>
  );
}