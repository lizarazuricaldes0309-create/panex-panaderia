import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Gift, LogOut, Mail, Phone, RefreshCw, ShieldCheck, Star, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type AuthMethod = "email" | "phone";
type AuthMode = "login" | "register" | "verify";

export default function CustomerAuth() {
  const utils = trpc.useUtils();
  const customerQuery = trpc.customers.me.useQuery();
  const [mode, setMode] = useState<AuthMode>("login");
  const [method, setMethod] = useState<AuthMethod>("email");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "", code: "" });

  const login = trpc.customers.login.useMutation({
    onSuccess: customer => {
      utils.customers.me.setData(undefined, customer);
      toast.success(`Qué gusto verte, ${customer.name.split(" ")[0]}.`);
    },
  });
  const register = trpc.customers.register.useMutation({
    onSuccess: result => {
      if (result.requiresVerification) {
        setMethod(result.verificationMethod);
        setForm(current => ({ ...current, email: result.email ?? "", phone: result.phone ?? "", code: "" }));
        setMode("verify");
        toast.success(result.verificationMethod === "phone" ? "Te enviamos un código por SMS." : "Te enviamos un código de 6 dígitos. Revisa tu correo.");
      }
    },
  });
  const verifyEmail = trpc.customers.verifyEmail.useMutation({
    onSuccess: customer => {
      utils.customers.me.setData(undefined, customer);
      toast.success("Correo verificado. Ganaste 100 puntos y un cupón de bienvenida.");
    },
  });
  const verifyPhone = trpc.customers.verifyPhone.useMutation({
    onSuccess: customer => {
      utils.customers.me.setData(undefined, customer);
      toast.success("Teléfono verificado. Ganaste 100 puntos y un cupón de bienvenida.");
    },
  });
  const resendEmail = trpc.customers.resendVerification.useMutation({ onSuccess: () => toast.success("Enviamos un código nuevo a tu correo.") });
  const resendPhone = trpc.customers.resendPhoneVerification.useMutation({ onSuccess: () => toast.success("Enviamos un código SMS nuevo a tu teléfono.") });
  const logout = trpc.customers.logout.useMutation({ onSuccess: () => { utils.customers.me.setData(undefined, null); toast.success("Sesión cerrada correctamente."); } });

  function update(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setForm(current => ({ ...current, password: "", confirmPassword: "", code: "" }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (mode === "verify") {
        if (method === "phone") await verifyPhone.mutateAsync({ phone: form.phone, code: form.code });
        else await verifyEmail.mutateAsync({ email: form.email, code: form.code });
        return;
      }
      if (mode === "register") {
        if (form.password !== form.confirmPassword) { toast.error("Las contraseñas no coinciden."); return; }
        await register.mutateAsync({ name: form.name, email: method === "email" ? form.email : undefined, phone: method === "phone" ? form.phone : undefined, password: form.password });
        return;
      }
      await login.mutateAsync({ method, identifier: method === "email" ? form.email : form.phone, password: form.password });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos completar la acción.");
    }
  }

  const pending = login.isPending || register.isPending || verifyEmail.isPending || verifyPhone.isPending || resendEmail.isPending || resendPhone.isPending;
  const customer = customerQuery.data;
  const identifierLabel = method === "phone" ? "Número de teléfono" : "Correo electrónico";
  const identifierPlaceholder = method === "phone" ? "+591 70000000" : "tu@correo.com";

  return <div className="min-h-screen bg-[#fffaf4] text-[#30251f]">
    <header className="border-b border-[#eadfd2] bg-[#fffaf4]/95">
      <div className="container flex h-[76px] items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label="Volver a Panex"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#a64b2a] text-xl text-[#fffaf4]">✦</span><span className="leading-none"><span className="block font-display text-2xl font-bold tracking-tight text-[#6e3824]">Panex</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#a88975]">panadería artesanal</span></span></Link>
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#6e3824] hover:text-[#a64b2a]"><ArrowLeft className="h-4 w-4" /> Volver a la tienda</Link>
      </div>
    </header>
    <main className="container grid min-h-[calc(100vh-77px)] items-center gap-10 py-10 lg:grid-cols-[.9fr_1.1fr] lg:py-16">
      <section className="hidden rounded-[34px] bg-[#30251f] p-10 text-[#fff8f0] lg:block lg:p-12"><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9b26d]">Club Panex</span><h1 className="mt-4 max-w-md font-display text-5xl font-semibold leading-tight">Tu cuenta te abre más beneficios.</h1><p className="mt-6 max-w-md leading-8 text-[#d4bdae]">Verifica tu correo o teléfono para ganar puntos, recibir un cupón de bienvenida y compartir reseñas reales de tus favoritos.</p><div className="mt-10 space-y-4 text-sm text-[#f4dfce]"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[#e9b26d]"><Gift className="h-4 w-4" /></span> 100 puntos de bienvenida</div><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[#e9b26d]"><Star className="h-4 w-4" /></span> Reseñas y estrellas verificadas</div><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[#e9b26d]"><ShieldCheck className="h-4 w-4" /></span> Correo o teléfono protegido y confirmado</div></div></section>
      <section className="mx-auto w-full max-w-xl rounded-[34px] border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-[0_20px_60px_rgba(93,54,34,.08)] sm:p-9">
        {customer ? <div><div className="flex items-start justify-between gap-4"><div><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f7efe7] text-[#a64b2a]"><UserRound className="h-7 w-7" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#a64b2a]">Mi cuenta verificada</p><h2 className="mt-2 font-display text-4xl font-semibold text-[#4e2b1f]">Hola, {customer.name.split(" ")[0]}.</h2></div><ShieldCheck className="h-6 w-6 text-[#7d9a78]" /></div><p className="mt-4 leading-7 text-[#806f64]">Tu cuenta está confirmada. Ahora tus reseñas pueden aparecer como verificadas y tus beneficios quedan guardados.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#f7efe7] p-4"><div className="flex items-center gap-2 text-[#a64b2a]"><Star className="h-4 w-4 fill-current" /><span className="text-xs font-bold uppercase tracking-[0.1em]">Puntos Panex</span></div><p className="mt-2 font-display text-3xl text-[#4e2b1f]">{customer.loyaltyPoints}</p><p className="text-xs text-[#806f64]">Canjeables en próximos pedidos</p></div><div className="rounded-2xl bg-[#fff0d7] p-4"><div className="flex items-center gap-2 text-[#9b5a26]"><Gift className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.1em]">Cupón de bienvenida</span></div><p className="mt-2 font-mono text-lg font-bold text-[#6e3824]">{customer.welcomeCouponCode ?? "—"}</p><p className="text-xs text-[#806f64]">Preséntalo en tu primer pedido</p></div></div><div className="mt-6 space-y-3 rounded-2xl bg-[#f7efe7] p-5 text-sm"><div className="flex items-center gap-3"><UserRound className="h-4 w-4 text-[#a64b2a]" /><span className="font-semibold text-[#4e2b1f]">{customer.name}</span></div>{customer.email && <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#a64b2a]" /><span className="text-[#806f64]">{customer.email}</span></div>}{customer.phone && <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#a64b2a]" /><span className="text-[#806f64]">{customer.phone}</span></div>}</div><div className="mt-7 flex flex-wrap gap-3"><Link href="/" className="inline-flex items-center gap-2 rounded-full bg-[#a64b2a] px-5 py-3 text-sm font-bold text-white hover:bg-[#873b22]">Explorar productos <ArrowRight className="h-4 w-4" /></Link><button onClick={() => logout.mutate()} disabled={logout.isPending} className="inline-flex items-center gap-2 rounded-full border border-[#d9c7b7] px-5 py-3 text-sm font-bold text-[#6e3824] hover:border-[#a64b2a]"><LogOut className="h-4 w-4" /> Cerrar sesión</button></div></div> : <>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a64b2a]">Cuenta de cliente</p><h1 className="mt-2 font-display text-4xl font-semibold text-[#4e2b1f]">{mode === "verify" ? `Confirma tu ${method === "phone" ? "teléfono" : "correo"}.` : mode === "login" ? "Bienvenido de nuevo." : "Únete al Club Panex."}</h1><p className="mt-4 leading-7 text-[#806f64]">{mode === "verify" ? `Enviamos un código de 6 dígitos a ${method === "phone" ? form.phone : form.email}.` : mode === "login" ? "Ingresa con tu correo o recibe un código por SMS en tu teléfono." : "Regístrate con tu correo o teléfono y verifica tu cuenta para ganar 100 puntos."}</p></div>
          {mode !== "verify" && <><div className="mt-7 grid grid-cols-2 rounded-2xl bg-[#f7efe7] p-1"><button onClick={() => selectMode("login")} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${mode === "login" ? "bg-[#fffdf9] text-[#a64b2a] shadow-sm" : "text-[#806f64]"}`}>Iniciar sesión</button><button onClick={() => selectMode("register")} className={`rounded-xl px-3 py-2.5 text-sm font-bold ${mode === "register" ? "bg-[#fffdf9] text-[#a64b2a] shadow-sm" : "text-[#806f64]"}`}>Crear cuenta</button></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMethod("email")} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${method === "email" ? "border-[#a64b2a] bg-[#fff0e5] text-[#a64b2a]" : "border-[#eadfd2] text-[#806f64]"}`}><Mail className="h-4 w-4" /> Con correo</button><button type="button" onClick={() => setMethod("phone")} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${method === "phone" ? "border-[#a64b2a] bg-[#fff0e5] text-[#a64b2a]" : "border-[#eadfd2] text-[#806f64]"}`}><Phone className="h-4 w-4" /> Con teléfono</button></div></>}
          <form onSubmit={submit} className="mt-7 space-y-4">{mode === "register" && <Field label="Nombre completo" value={form.name} onChange={value => update("name", value)} placeholder="Tu nombre" icon={<UserRound className="h-4 w-4" />} />}{mode !== "verify" && <Field label={identifierLabel} value={method === "email" ? form.email : form.phone} onChange={value => update(method === "email" ? "email" : "phone", value)} placeholder={identifierPlaceholder} type={method === "email" ? "email" : "tel"} icon={method === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />} />}{mode === "verify" ? <Field label="Código de 6 dígitos" value={form.code} onChange={value => update("code", value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" icon={<ShieldCheck className="h-4 w-4" />} /> : <><Field label="Contraseña" value={form.password} onChange={value => update("password", value)} placeholder="Mínimo 8 caracteres" type="password" icon={<ShieldCheck className="h-4 w-4" />} />{mode === "register" && <Field label="Repetir contraseña" value={form.confirmPassword} onChange={value => update("confirmPassword", value)} placeholder="Repite tu contraseña" type="password" icon={<ShieldCheck className="h-4 w-4" />} />}</>}<button type="submit" disabled={pending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#a64b2a] px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_25px_rgba(166,75,42,.2)] hover:bg-[#873b22] disabled:opacity-60">{mode === "verify" ? `Verificar ${method === "phone" ? "teléfono" : "correo"}` : mode === "login" ? "Entrar a mi cuenta" : "Crear mi cuenta"}<ArrowRight className="h-4 w-4" /></button></form>
          {mode === "verify" && <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs font-bold"><button onClick={() => method === "phone" ? resendPhone.mutate({ phone: form.phone }) : resendEmail.mutate({ email: form.email })} disabled={pending} className="inline-flex items-center gap-1.5 text-[#a64b2a] hover:text-[#6e3824]"><RefreshCw className="h-3.5 w-3.5" /> Reenviar código</button><button onClick={() => selectMode("login")} className="text-[#806f64] hover:text-[#a64b2a]">Volver a iniciar sesión</button></div>}
          <p className="mt-6 text-center text-xs leading-5 text-[#a88975]">Nunca guardamos códigos en el navegador. Tu cuenta se activa solo después de confirmar tu correo o teléfono.</p>
        </>}
      </section>
    </main>
  </div>;
}

function Field({ label, value, onChange, placeholder, type = "text", icon }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; icon: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-[#6e5b4e]">{label}<span className="relative mt-2 block"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a64b2a]">{icon}</span><input required value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} type={type} className="w-full rounded-2xl border border-[#eadfd2] bg-[#fffaf4] py-3 pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[#c98762]" /></span></label>;
}
