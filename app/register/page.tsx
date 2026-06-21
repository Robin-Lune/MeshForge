import Nav from "@/components/Nav";
import RegisterForm from "@/components/RegisterForm";

export const metadata = { title: "Devenir relais — MeshForge" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-8 border-b border-black/10 px-6 py-3 dark:border-white/15">
        <h1 className="text-lg font-semibold tracking-tight">MeshForge</h1>
        <Nav active="/register" />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-8">
        <h2 className="mb-1 text-xl font-semibold">Devenir relais</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Enregistre ton relais pour qu’il publie sa télémétrie vers MeshForge.
          Tu recevras des identifiants MQTT à configurer sur ton Heltec.
        </p>
        <RegisterForm />
      </main>
    </div>
  );
}
