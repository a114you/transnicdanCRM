import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Вход",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10 px-3">
      <LoginForm />
    </div>
  );
}
