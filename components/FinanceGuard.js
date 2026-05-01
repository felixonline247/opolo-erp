import { useState } from 'react';

export default function FinanceGuard({ children, adminPin }) {
  const [inputPin, setInputPin] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);

  const checkPin = () => {
    if (inputPin === adminPin) {
      setIsAuthorized(true);
    } else {
      alert("Incorrect Passcode!");
      setInputPin('');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white shadow-xl rounded-lg border border-gray-200">
        <h2 className="text-xl font-bold mb-4 text-navy-900">Financial Vault Access</h2>
        <input 
          type="password" 
          placeholder="Enter 4-Digit Pin"
          className="border p-2 rounded mb-4 text-center tracking-widest"
          value={inputPin}
          onChange={(e) => setInputPin(e.target.value)}
          maxLength={4}
        />
        <button 
          onClick={checkPin}
          className="bg-navy-900 text-white px-6 py-2 rounded hover:bg-blue-800"
        >
          Unlock Records
        </button>
      </div>
    );
  }

  return <>{children}</>;
}