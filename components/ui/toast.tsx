// Toast Notification Component

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  onRemove: () => void;
}

export function Toast({ message, type = "info", onRemove }: ToastProps) {
  const styles = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-500",
  };

  return (
    <div className={`${styles[type]} text-white px-6 py-3 rounded-lg shadow-lg`}>
      <div className="flex justify-between items-center">
        <p>{message}</p>
        <button
          onClick={onRemove}
          className="text-white/70 hover:text-white ml-4"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
