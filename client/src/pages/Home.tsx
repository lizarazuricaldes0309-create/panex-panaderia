import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coffee,
  HeartHandshake,
  Instagram,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquareText,
  Music2,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const WHATSAPP_NUMBER = "59178453454";
const MAPS_URL = "https://maps.app.goo.gl/r6HBv6p2jmGxG8se6";
const INSTAGRAM_URL = "https://www.instagram.com/ariel_lizarazur?stkn=MWduOTExdG5sYm13ZQ==";
const TIKTOK_URL = "https://www.tiktok.com/@ariel.lizarazu7";
const HERO_IMAGE = "/manus-storage/panex-hero.jpg";

const fallbackProducts = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Masa Madre Panex", slug: "masa-madre-panex", category: "Panes", description: "Fermentación lenta de 24 horas, corteza crujiente y miga con carácter.", price: 24, unit: "pieza · 650 g", imageUrl: "/manus-storage/panex-bread-sourdough.jpg", isFeatured: 1, isActive: 1 },
  { id: "00000000-0000-4000-8000-000000000002", name: "Croissant de Mantequilla", slug: "croissant-mantequilla", category: "Bollería", description: "Capas ligeras, mantequilla real y un dorado que cruje desde el primer bocado.", price: 12, unit: "pieza", imageUrl: "/manus-storage/panex-pastry-croissant.jpg", isFeatured: 1, isActive: 1 },
  { id: "00000000-0000-4000-8000-000000000003", name: "Roll de Canela", slug: "roll-canela", category: "Bollería", description: "Canela aromática, glaseado suave y una textura esponjosa recién horneada.", price: 15, unit: "pieza", imageUrl: "/manus-storage/panex-pastry-cinnamon.jpg", isFeatured: 1, isActive: 1 },
  { id: "00000000-0000-4000-8000-000000000004", name: "Torta de Celebración", slug: "torta-celebracion", category: "Pastelería", description: "Bizcocho de vainilla, crema ligera y frutos rojos para celebrar bonito.", price: 165, unit: "8–10 porciones", imageUrl: "/manus-storage/panex-cake-fruit.jpg", isFeatured: 1, isActive: 1 },
  { id: "00000000-0000-4000-8000-000000000005", name: "Pan de Campo", slug: "pan-de-campo", category: "Panes", description: "Harina de trigo, miel y semillas tostadas en una hogaza para compartir.", price: 22, unit: "pieza · 550 g", imageUrl: "/manus-storage/panex-bread-seeds.jpg", isFeatured: 0, isActive: 1 },
  { id: "00000000-0000-4000-8000-000000000006", name: "Caja Brunch", slug: "caja-brunch", category: "Combos", description: "Dos croissants, dos rolls y una hogaza mini para empezar el día sin prisa.", price: 58, unit: "caja para 2", imageUrl: "/manus-storage/panex-combo-box.jpg", isFeatured: 0, isActive: 1 },
];

type Product = typeof fallbackProducts[number];
type CartLine = Product & { quantity: number };

function money(value: number) {
  return new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB", maximumFractionDigits: 0 }).format(value);
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const { data: productsData, isLoading } = trpc.products.list.useQuery();
  const { data: accountCustomer } = trpc.customers.me.useQuery();
  const createOrder = trpc.orders.create.useMutation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", notes: "" });
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null);

  const products = (productsData?.length ? productsData : fallbackProducts) as Product[];
  const categories = ["Todos", ...Array.from(new Set(products.map(product => product.category)))];
  const filteredProducts = useMemo(() => products.filter(product => {
    const matchesCategory = activeCategory === "Todos" || product.category === activeCategory;
    const matchesQuery = `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [activeCategory, products, query]);
  const featured = products.filter(product => product.isFeatured).slice(0, 4);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  function addToCart(product: Product) {
    setCart(current => {
      const existing = current.find(line => line.id === product.id);
      return existing
        ? current.map(line => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { ...product, quantity: 1 }];
    });
    toast.success(`${product.name} se agregó a tu pedido`);
  }

  function changeQuantity(id: string, delta: number) {
    setCart(current => current.flatMap(line => {
      if (line.id !== id) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  }

  async function sendOrder() {
    if (!customer.name || !customer.phone) {
      toast.error("Cuéntanos tu nombre y teléfono para continuar.");
      return;
    }
    if (!cart.length) {
      toast.error("Agrega al menos un producto a tu pedido.");
      return;
    }
    const items = cart.map(line => `${line.quantity} × ${line.name}`).join(", ");
    try {
      await createOrder.mutateAsync({
        customerName: customer.name,
        phone: customer.phone,
        deliveryAddress: customer.address || undefined,
        notes: customer.notes || undefined,
        items,
        total: cartTotal,
      });
      const message = [
        "Hola Panex, quiero hacer este pedido:",
        "",
        ...cart.map(line => `• ${line.quantity} × ${line.name} — ${money(line.price * line.quantity)}`),
        "",
        `Total estimado: ${money(cartTotal)}`,
        `Nombre: ${customer.name}`,
        `Teléfono: ${customer.phone}`,
        customer.address ? `Entrega: ${customer.address}` : "Retiro en tienda",
        customer.notes ? `Notas: ${customer.notes}` : "",
      ].filter(Boolean).join("\n");
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      toast.success("Pedido listo. Te llevamos a WhatsApp para confirmarlo.");
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch {
      toast.error("No pudimos registrar el pedido. Intenta nuevamente.");
    }
  }

  return (
    <div className="min-h-screen bg-[#fffaf4] text-[#30251f]">
      <div className="bg-[#30251f] px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f7d8b7]">
        Horneamos cada mañana · Pedidos con 24 h de anticipación
      </div>
      <header className="sticky top-0 z-40 border-b border-[#eadfd2]/80 bg-[#fffaf4]/95 backdrop-blur-md">
        <div className="container flex h-[76px] items-center justify-between gap-5">
          <a href="#inicio" className="flex items-center gap-3" aria-label="Panex inicio">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#a64b2a] text-xl text-[#fffaf4] shadow-sm">✦</span>
            <span className="leading-none"><span className="block font-display text-2xl font-bold tracking-tight text-[#6e3824]">Pan</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#a88975]">panadería</span></span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#6e5b4e] md:flex">
            <a href="#catalogo" className="hover:text-[#a64b2a]">Catálogo</a>
            <a href="#nosotros" className="hover:text-[#a64b2a]">Nuestra historia</a>
            <a href="#visitanos" className="hover:text-[#a64b2a]">Visítanos</a>
            <Link href="/cuenta" className="inline-flex items-center gap-1.5 hover:text-[#a64b2a]"><UserRound className="h-4 w-4" /> Mi cuenta</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => setCartOpen(true)} className="relative grid h-11 w-11 place-items-center rounded-full border border-[#eadfd2] bg-[#fffdf9] text-[#6e3824] hover:border-[#c98762]" aria-label="Abrir pedido">
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#a64b2a] px-1 text-[10px] font-bold text-white">{cartCount}</span>}
            </button>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="grid h-11 w-11 place-items-center rounded-full border border-[#eadfd2] md:hidden" aria-label="Abrir menú">{mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            <button onClick={() => scrollToId("catalogo")} className="hidden rounded-full bg-[#a64b2a] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(166,75,42,.2)] hover:bg-[#873b22] sm:block">Pedir ahora <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          </div>
        </div>
        {mobileMenu && <div className="border-t border-[#eadfd2] bg-[#fffaf4] px-5 py-4 md:hidden"><div className="flex flex-col gap-4 text-sm font-semibold"><a href="#catalogo" onClick={() => setMobileMenu(false)}>Catálogo</a><a href="#nosotros" onClick={() => setMobileMenu(false)}>Nuestra historia</a><a href="#visitanos" onClick={() => setMobileMenu(false)}>Visítanos</a><Link href="/cuenta" onClick={() => setMobileMenu(false)} className="inline-flex items-center gap-2"><UserRound className="h-4 w-4" /> Mi cuenta</Link></div></div>}
      </header>

      <main>
        <section id="inicio" className="container grid items-center gap-10 py-12 md:grid-cols-[.87fr_1.13fr] md:py-20 lg:gap-16 lg:py-24">
          <div className="animate-rise max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ebc6a6] bg-[#fff3e6] px-3 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#a64b2a]"><Sparkles className="h-3.5 w-3.5" /> hecho lento, disfrutado rápido</div>
            <h1 className="font-display text-5xl font-semibold leading-[.98] tracking-[-0.045em] text-[#4e2b1f] sm:text-6xl lg:text-[76px]">Pan que <span className="italic text-[#a64b2a]">se siente</span> como hogar.</h1>
            <p className="mt-7 max-w-md text-lg leading-8 text-[#806f64]">Masa madre, mantequilla real y manos felices. Horneamos pequeñas tandas cada día para que tu mesa tenga algo especial.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><button onClick={() => scrollToId("catalogo")} className="rounded-full bg-[#a64b2a] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_25px_rgba(166,75,42,.2)] hover:bg-[#873b22]">Explorar el catálogo <ArrowRight className="ml-2 inline h-4 w-4" /></button><a href="#nosotros" className="rounded-full border border-[#d9c7b7] px-6 py-3.5 text-center text-sm font-bold text-[#6e3824] hover:border-[#a64b2a]">Conoce nuestra historia</a></div>
            <div className="mt-11 flex items-center gap-6 border-t border-[#eadfd2] pt-5"><div><div className="flex items-center gap-1 text-[#c76e42]"><Star className="h-4 w-4 fill-current" /><Star className="h-4 w-4 fill-current" /><Star className="h-4 w-4 fill-current" /><Star className="h-4 w-4 fill-current" /><Star className="h-4 w-4 fill-current" /></div><span className="mt-1 block text-xs text-[#806f64]">4.9 / 5 por nuestros vecinos</span></div><div className="h-9 w-px bg-[#eadfd2]" /><div><span className="block font-display text-2xl font-bold text-[#6e3824]">24 h</span><span className="text-xs text-[#806f64]">de fermentación lenta</span></div></div>
          </div>
          <div className="relative animate-rise [animation-delay:120ms]">
            <div className="absolute -left-4 -top-4 z-10 grid h-20 w-20 place-items-center rounded-full bg-[#e9b26d] text-center text-xs font-bold leading-4 text-[#5d3421] shadow-lg sm:-left-7 sm:-top-7"><span>100%<br />artesanal</span></div>
            <div className="overflow-hidden rounded-[34px] rounded-bl-[120px] border-[10px] border-[#fffdf9] bg-[#e9d7c7] shadow-[0_25px_70px_rgba(93,54,34,.16)]"><img src={HERO_IMAGE} alt="Panes artesanales recién horneados en Panex" className="aspect-[4/3] w-full object-cover" /></div>
            <div className="absolute -bottom-5 right-4 flex items-center gap-3 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-3 shadow-xl sm:right-10"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f6e8d8] text-[#a64b2a]"><Clock3 className="h-5 w-5" /></span><span><strong className="block text-sm text-[#4e2b1f]">Sale calientito</strong><small className="text-xs text-[#806f64]">Todos los días desde las 7:30</small></span></div>
          </div>
        </section>

        <section className="border-y border-[#eadfd2] bg-[#f7efe7] py-5"><div className="container flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-[#806f64] sm:justify-between"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#a64b2a]" /> ingredientes honestos</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#a64b2a]" /> sin mejoradores artificiales</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#a64b2a]" /> pedidos por WhatsApp</span><span className="hidden items-center gap-2 lg:flex"><Check className="h-4 w-4 text-[#a64b2a]" /> retiro o entrega local</span></div></section>

        <section id="catalogo" className="container scroll-mt-24 py-20 lg:py-28">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#a64b2a]">La vitrina de hoy</span><h2 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[#4e2b1f] sm:text-5xl">Elige algo rico.</h2></div><p className="max-w-sm text-sm leading-6 text-[#806f64]">Todo sale de nuestro horno en pequeñas tandas. Si algo se agota, escríbenos: siempre estamos horneando algo nuevo.</p></div>
          <div className="mb-9 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap gap-2">{categories.map(category => <button key={category} onClick={() => setActiveCategory(category)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeCategory === category ? "bg-[#a64b2a] text-white" : "border border-[#eadfd2] bg-[#fffdf9] text-[#806f64] hover:border-[#c98762]"}`}>{category}</button>)}</div><div className="flex items-center gap-2 rounded-full border border-[#eadfd2] bg-[#fffdf9] px-4 py-2 text-sm text-[#806f64]"><span className="text-[#a64b2a]">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en la vitrina" className="w-full bg-transparent outline-none placeholder:text-[#b5a59a] md:w-48" /></div></div>
          {isLoading && <div className="mb-8 rounded-2xl border border-[#eadfd2] bg-white/50 p-4 text-sm text-[#806f64]">Calentando el horno y preparando la vitrina…</div>}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{filteredProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={addToCart} onReview={() => setReviewProduct(product)} />)}</div>
          {!filteredProducts.length && <div className="rounded-3xl border border-dashed border-[#d9c7b7] p-12 text-center text-[#806f64]">No encontramos ese antojo. Prueba con otra categoría.</div>}
        </section>

        <section id="nosotros" className="scroll-mt-24 bg-[#30251f] py-20 text-[#fff8f0] lg:py-24"><div className="container grid items-center gap-12 lg:grid-cols-[.85fr_1.15fr]"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9b26d]">Nuestra forma de hacer</span><h2 className="mt-3 max-w-lg font-display text-4xl font-semibold leading-tight sm:text-5xl">El tiempo también es un ingrediente.</h2><p className="mt-6 max-w-lg leading-8 text-[#d4bdae]">Panex nació para recuperar el gusto de las cosas hechas con calma. Alimentamos nuestra masa madre, respetamos los descansos y dejamos que cada horno haga su parte.</p><a href="#visitanos" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#f2c58d] hover:text-white">Ven a conocernos <ArrowRight className="h-4 w-4" /></a></div><div className="grid gap-4 sm:grid-cols-2"><ValueCard icon={<Coffee />} title="Fermentación lenta" text="Más sabor, mejor textura y una miga que se disfruta de verdad." /><ValueCard icon={<HeartHandshake />} title="Hecho cercano" text="Trabajamos con proveedores y productores de nuestra región." /><ValueCard icon={<Truck />} title="Para tu mesa" text="Retira en tienda o coordina una entrega local por WhatsApp." /><ValueCard icon={<Sparkles />} title="Pequeñas tandas" text="Cuidamos cada pieza como si fuera la primera del día." /></div></div></section>

        <section id="visitanos" className="container scroll-mt-24 py-20 lg:py-24"><div className="grid overflow-hidden rounded-[32px] border border-[#eadfd2] bg-[#f7efe7] lg:grid-cols-[.9fr_1.1fr]"><div className="p-8 sm:p-12"><span className="text-xs font-bold uppercase tracking-[0.18em] text-[#a64b2a]">Pasa a saludar</span><h2 className="mt-3 font-display text-4xl font-semibold text-[#4e2b1f]">Tu café sabe mejor aquí.</h2><p className="mt-5 leading-7 text-[#806f64]">Te esperamos en nuestro rincón de Santa Cruz para compartir pan recién hecho, café y una charla sin apuro.</p><div className="mt-8 space-y-5 text-sm"><div className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#a64b2a]" /><span><strong className="block text-[#4e2b1f]">9VW6+8W5, Santa Cruz de la Sierra</strong><span className="text-[#806f64]">Coordenadas: -17.604234, -63.137653</span></span></div><div className="flex gap-3"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#a64b2a]" /><span><strong className="block text-[#4e2b1f]">Lun — Sáb · 7:30 a 19:30</strong><span className="text-[#806f64]">Domingos · 8:00 a 14:00</span></span></div><div className="flex gap-3"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#a64b2a]" /><span><strong className="block text-[#4e2b1f]">+591 78453454</strong><span className="text-[#806f64]">Pedidos y reservas por WhatsApp</span></span></div></div><div className="mt-9 flex flex-wrap gap-3"><a href={MAPS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#c98762] bg-[#fffdf9] px-5 py-3 text-sm font-bold text-[#a64b2a] hover:bg-[#fff3e6]"><MapPin className="h-4 w-4" /> Cómo llegar</a><a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#a64b2a] px-5 py-3 text-sm font-bold text-white hover:bg-[#873b22]"><MessageCircle className="h-4 w-4" /> Escribir por WhatsApp</a></div></div><div className="relative min-h-[300px] overflow-hidden bg-[#d9b79b]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.3),transparent_32%),linear-gradient(135deg,#d9b79b,#a77354)]" /><div className="absolute inset-0 grid place-items-center"><div className="rounded-[28px] border border-white/40 bg-white/20 px-8 py-7 text-center text-[#fffaf4] backdrop-blur-sm"><MapPin className="mx-auto mb-3 h-8 w-8" /><p className="font-display text-2xl">Aquí empieza<br />tu momento Panex</p><p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/80">9VW6+8W5 · Santa Cruz</p></div></div></div></div></section>
      </main>

      <footer className="border-t border-[#eadfd2] bg-[#fffdf9] py-9"><div className="container flex flex-col justify-between gap-6 text-sm text-[#806f64] md:flex-row md:items-center"><div><span className="font-display text-xl font-bold text-[#6e3824]">Panex</span><span className="ml-3">panadería artesanal</span></div><div className="flex flex-wrap items-center gap-5"><a href="#catalogo" className="hover:text-[#a64b2a]">Catálogo</a><a href="#visitanos" className="hover:text-[#a64b2a]">Contacto</a><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[#a64b2a]"><Instagram className="h-4 w-4" /> Instagram</a><a href={TIKTOK_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[#a64b2a]"><Music2 className="h-4 w-4" /> TikTok</a><Link href="/admin" className="text-xs font-bold uppercase tracking-[0.12em] text-[#a64b2a]">Acceso admin</Link></div></div></footer>

      {cartOpen && <div className="fixed inset-0 z-50"><button className="absolute inset-0 bg-[#30251f]/45 backdrop-blur-sm" onClick={() => setCartOpen(false)} aria-label="Cerrar pedido" /><aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[#fffaf4] shadow-2xl"><div className="flex items-center justify-between border-b border-[#eadfd2] px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#a64b2a]">Tu pedido</p><h2 className="font-display text-2xl font-semibold text-[#4e2b1f]">Lo rico va contigo</h2></div><button onClick={() => setCartOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-[#eadfd2]"><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-y-auto px-6 py-5">{!cart.length ? <div className="flex h-full flex-col items-center justify-center text-center"><span className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#f4e7d9] text-[#a64b2a]"><ShoppingBag className="h-7 w-7" /></span><h3 className="font-display text-2xl text-[#4e2b1f]">Tu bolsa está vacía</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[#806f64]">Agrega tus favoritos y te ayudamos a coordinar la entrega por WhatsApp.</p><button onClick={() => { setCartOpen(false); scrollToId("catalogo"); }} className="mt-6 rounded-full bg-[#a64b2a] px-5 py-3 text-sm font-bold text-white">Ver catálogo</button></div> : <div className="space-y-4">{cart.map(line => <div key={line.id} className="flex gap-3 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-3"><img src={line.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#4e2b1f]">{line.name}</p><p className="mt-1 text-xs text-[#806f64]">{money(line.price)} · {line.unit}</p><div className="mt-2 flex items-center gap-2"><button onClick={() => changeQuantity(line.id, -1)} className="grid h-7 w-7 place-items-center rounded-full border border-[#eadfd2]"><Minus className="h-3 w-3" /></button><span className="w-5 text-center text-sm font-bold">{line.quantity}</span><button onClick={() => changeQuantity(line.id, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-[#f4e7d9] text-[#a64b2a]"><Plus className="h-3 w-3" /></button></div></div><p className="text-sm font-bold text-[#6e3824]">{money(line.price * line.quantity)}</p></div>)}</div>}</div>{cart.length > 0 && <div className="border-t border-[#eadfd2] bg-[#fffdf9] px-6 py-5"><div className="mb-4 flex items-center justify-between text-sm text-[#806f64]"><span>Subtotal estimado</span><strong className="text-xl text-[#4e2b1f]">{money(cartTotal)}</strong></div><button onClick={() => setCheckoutOpen(true)} className="w-full rounded-full bg-[#a64b2a] py-3.5 text-sm font-bold text-white hover:bg-[#873b22]">Continuar pedido <ArrowRight className="ml-1 inline h-4 w-4" /></button><p className="mt-3 text-center text-[11px] text-[#a88975]">Confirmamos disponibilidad y entrega por WhatsApp.</p></div>}</aside></div>}

      {checkoutOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-[#30251f]/55 p-4"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-[#fffaf4] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#a64b2a]">Casi listo</p><h2 className="mt-2 font-display text-3xl text-[#4e2b1f]">¿A nombre de quién?</h2></div><button onClick={() => setCheckoutOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-[#eadfd2]"><X className="h-5 w-5" /></button></div><div className="mt-6 grid gap-4"><Field label="Tu nombre" value={customer.name} onChange={value => setCustomer({ ...customer, name: value })} placeholder="Ej. María Fernanda" /><Field label="WhatsApp / teléfono" value={customer.phone} onChange={value => setCustomer({ ...customer, phone: value })} placeholder="Ej. 700 12345" /><Field label="Dirección de entrega (opcional)" value={customer.address} onChange={value => setCustomer({ ...customer, address: value })} placeholder="Barrio, calle y referencia" /><label className="text-sm font-semibold text-[#6e5b4e]">Notas <textarea value={customer.notes} onChange={e => setCustomer({ ...customer, notes: e.target.value })} placeholder="¿Alguna indicación especial?" rows={3} className="mt-2 w-full resize-none rounded-2xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#c98762]" /></label></div><div className="mt-6 rounded-2xl bg-[#f7efe7] p-4"><div className="flex items-center justify-between text-sm"><span className="text-[#806f64]">Total del pedido</span><strong className="text-xl text-[#4e2b1f]">{money(cartTotal)}</strong></div><p className="mt-2 text-xs leading-5 text-[#806f64]">Al continuar registramos tu solicitud y abrimos WhatsApp con el detalle. El equipo Panex confirmará disponibilidad y costo de entrega.</p></div><button onClick={sendOrder} disabled={createOrder.isPending} className="mt-5 w-full rounded-full bg-[#238b5d] py-3.5 text-sm font-bold text-white hover:bg-[#176d47] disabled:opacity-60">{createOrder.isPending ? "Registrando pedido…" : <><MessageCircle className="mr-2 inline h-4 w-4" /> Confirmar por WhatsApp</>}</button></div></div>}
      {reviewProduct && <ReviewModal product={reviewProduct} customer={accountCustomer} onClose={() => setReviewProduct(null)} />}
    </div>
  );
}

type AccountCustomer = { id: string; name: string; email: string; emailVerified: boolean };

function ReviewModal({ product, customer, onClose }: { product: Product; customer: AccountCustomer | null | undefined; onClose: () => void }) {
  const utils = trpc.useUtils();
  const reviewInput = useMemo(() => ({ productId: product.id }), [product.id]);
  const reviewsQuery = trpc.reviews.list.useQuery(reviewInput);
  const createReview = trpc.reviews.create.useMutation({ onSuccess: async () => { await utils.reviews.list.invalidate(reviewInput); toast.success("Tu reseña verificada fue publicada."); onClose(); } });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const reviews = reviewsQuery.data ?? [];
  const average = reviews.length ? (reviews.reduce((total, review) => total + review.rating, 0) / reviews.length).toFixed(1) : "—";
  async function submitReview() {
    try { await createReview.mutateAsync({ productId: product.id, rating, comment }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo publicar la reseña."); }
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#30251f]/55 p-4"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-[#fffaf4] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#a64b2a]">Opiniones verificadas</p><h2 className="mt-2 font-display text-3xl text-[#4e2b1f]">{product.name}</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[#eadfd2]"><X className="h-5 w-5" /></button></div><div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f7efe7] p-4"><div className="flex items-center gap-1 text-[#e0a361]">{[1, 2, 3, 4, 5].map(star => <Star key={star} className="h-5 w-5 fill-current" />)}</div><span className="font-bold text-[#6e3824]">{average}</span><span className="text-xs text-[#806f64]">{reviews.length} reseña{reviews.length === 1 ? "" : "s"}</span></div>{customer?.emailVerified ? <div className="mt-6 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4"><p className="text-sm font-bold text-[#4e2b1f]">Comparte tu experiencia</p><p className="mt-1 text-xs text-[#806f64]">Tu correo verificado aparecerá como cliente confirmado.</p><div className="mt-4 flex gap-1">{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star} estrellas`}><Star className={`h-7 w-7 ${star <= rating ? "fill-[#e0a361] text-[#e0a361]" : "text-[#d9c7b7]"}`} /></button>)}</div><textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder="¿Qué te pareció? (mínimo 8 caracteres)" className="mt-3 w-full resize-none rounded-2xl border border-[#eadfd2] bg-[#fffaf4] px-4 py-3 text-sm outline-none focus:border-[#c98762]" /><button onClick={submitReview} disabled={createReview.isPending || comment.trim().length < 8} className="mt-3 w-full rounded-full bg-[#a64b2a] py-3 text-sm font-bold text-white disabled:opacity-50">{createReview.isPending ? "Publicando…" : "Publicar reseña verificada"}</button></div> : <div className="mt-6 rounded-2xl bg-[#fff0d7] p-4 text-sm leading-6 text-[#6e3824]">Para publicar estrellas y reseñas necesitas <Link href="/cuenta" className="font-bold underline">crear una cuenta y verificar tu correo</Link>.</div>}<div className="mt-6 space-y-3">{reviews.map(review => <div key={review.id} className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-[#4e2b1f]">{review.reviewerName}</span><span className="flex items-center gap-1 text-[#e0a361]">{[1, 2, 3, 4, 5].map(star => <Star key={star} className={`h-3.5 w-3.5 ${star <= review.rating ? "fill-current" : ""}`} />)}</span></div><p className="mt-2 text-sm leading-6 text-[#806f64]">{review.comment}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7d9a78]">Cliente verificado</p></div>)}{!reviews.length && <p className="py-4 text-center text-sm text-[#806f64]">Aún no hay reseñas. Sé el primero en compartir tu experiencia.</p>}</div></div></div>;
}

function ProductCard({ product, onAdd, onReview, index }: { product: Product; onAdd: (product: Product) => void; onReview: () => void; index: number }) {
  return <article className="group hover-lift animate-rise overflow-hidden rounded-[22px] border border-[#eadfd2] bg-[#fffdf9] [animation-delay:calc(80ms*var(--i))]" style={{ "--i": index } as React.CSSProperties}><div className="relative overflow-hidden bg-[#f3e4d5]"><img src={product.imageUrl} alt={product.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" /><span className="absolute left-3 top-3 rounded-full bg-[#fffdf9]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a64b2a]">{product.category}</span><button onClick={() => onAdd(product)} className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-[#a64b2a] text-white opacity-0 shadow-lg transition group-hover:opacity-100" aria-label={`Agregar ${product.name}`}><Plus className="h-5 w-5" /></button></div><div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl font-semibold leading-tight text-[#4e2b1f]">{product.name}</h3><span className="shrink-0 text-sm font-bold text-[#a64b2a]">{money(product.price)}</span></div><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-[#806f64]">{product.description}</p><div className="mt-4 flex items-center justify-between border-t border-[#f0e5da] pt-3"><button onClick={onReview} className="inline-flex items-center gap-1 text-xs font-bold text-[#806f64] hover:text-[#a64b2a]"><MessageSquareText className="h-3 w-3" /> Reseñas</button><button onClick={() => onAdd(product)} className="text-xs font-bold text-[#a64b2a] hover:text-[#6e3824]">Añadir <ArrowRight className="ml-1 inline h-3 w-3" /></button></div></div></article>;
}

function ValueCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.06] p-5"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#f2c58d]/15 text-[#f2c58d]">{icon}</span><h3 className="mt-5 font-display text-xl text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-[#c8aea0]">{text}</p></div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-sm font-semibold text-[#6e5b4e]">{label}<input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#c98762]" /></label>;
}
