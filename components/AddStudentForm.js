import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AddStudentForm() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', code: '' });
  const [file, setFile] = useState(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    setLoading(true);

    let docUrl = '';
    
    // 1. Upload JPEG if present
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('student-docs')
        .upload(fileName, file);
      
      if (error) alert("Upload Error: " + error.message);
      else docUrl = fileName;
    }

    // 2. Save Student Data
    const { error: dbError } = await supabase.from('students').insert([
      { 
        full_name: formData.name, 
        phone_number: formData.phone, 
        jamb_profile_code: formData.code,
        document_url: docUrl 
      }
    ]);

    if (!dbError) alert("Student Registered Successfully!");
    setLoading(false);
  };

  return (
    <form onSubmit={handleUpload} className="p-6 bg-white rounded-lg shadow-md max-w-md">
      <h2 className="text-2xl font-bold mb-4 text-navy-900">New Registration</h2>
      <input 
        className="w-full border p-2 mb-3 rounded" 
        placeholder="Full Name" 
        onChange={(e) => setFormData({...formData, name: e.target.value})}
        required 
      />
      <input 
        className="w-full border p-2 mb-3 rounded" 
        placeholder="Phone (e.g. 234...)" 
        onChange={(e) => setFormData({...formData, phone: e.target.value})}
        required 
      />
      <input 
        className="w-full border p-2 mb-3 rounded" 
        placeholder="JAMB Profile Code" 
        onChange={(e) => setFormData({...formData, code: e.target.value})}
      />
      <label className="block text-sm text-gray-600 mb-1">Upload Document (JPEG)</label>
      <input 
        type="file" 
        accept="image/jpeg" 
        onChange={(e) => setFile(e.target.files[0])} 
        className="mb-4"
      />
      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-navy-900 text-white py-2 rounded font-bold hover:bg-blue-800"
      >
        {loading ? 'Processing...' : 'Register Student'}
      </button>
    </form>
  );
}