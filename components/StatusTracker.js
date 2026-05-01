const steps = ['Application Received', 'Processing', 'Done'];

export default function StatusTracker({ currentStatus }) {
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <div className="flex items-center w-full py-4">
      {steps.map((step, index) => (
        <div key={step} className="flex flex-1 items-center">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs 
            ${index <= currentIndex ? 'bg-navy-900' : 'bg-gray-300'}`}>
            {index + 1}
          </div>
          <div className="ml-2 text-xs font-medium text-gray-600">{step}</div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-1 mx-4 ${index < currentIndex ? 'bg-navy-900' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}