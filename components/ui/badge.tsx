// Badge Component for Status Displays

interface BadgeProps {
  variant?: "primary" | "success" | "warning" | "danger" | "gray";
  children: React.ReactNode;
}

export function Badge({ variant = "primary", children }: BadgeProps) {
  const styles = {
    primary: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    danger: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
