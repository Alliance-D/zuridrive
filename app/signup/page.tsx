/** /signup — client account creation. */

import SignupForm from "@/components/auth/SignupForm";
import Navbar from "@/components/navbar";

export const metadata = { title: "Sign up — ZuriDrive" };

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-bone">
      <Navbar />
      <div className="flex justify-center px-4 py-10">
        <SignupForm role="CLIENT" />
      </div>
    </div>
  );
}
