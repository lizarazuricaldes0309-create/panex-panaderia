import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Store } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";

const menuItems = [{ icon: LayoutDashboard, label: "Resumen", path: "/admin" }, { icon: Store, label: "Ver tienda", path: "/" }];
const SIDEBAR_WIDTH_KEY = "sidebar-width";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => { const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY); return saved ? parseInt(saved, 10) : 260; });
  const { loading, user, logout } = useAuth();
  const adminAccess = trpc.auth.adminAccess.useQuery(undefined, { retry: false });
  async function changeGoogleAccount() {
    try { await logout(); } finally { startLogin(); }
  }
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()); }, [sidebarWidth]);
  if (loading || adminAccess.isLoading) return <DashboardLayoutSkeleton />;
  if (!user) return <div className="flex min-h-screen items-center justify-center bg-[#fffaf4] p-6"><div className="w-full max-w-md rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-8 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#a64b2a] text-2xl text-white">✦</div><h1 className="mt-5 font-display text-3xl text-[#4e2b1f]">Acceso privado</h1><p className="mt-3 text-sm leading-6 text-[#806f64]">Continúa con Google usando únicamente el correo autorizado de Panex.</p><Button onClick={() => startLogin()} className="mt-6 w-full rounded-full bg-[#a64b2a] py-3 text-white hover:bg-[#873b22]">Continuar con Google</Button></div></div>;
  if (!adminAccess.data) return <div className="flex min-h-screen items-center justify-center bg-[#fffaf4] p-6"><div className="w-full max-w-md rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-8 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f4e7d9] text-2xl text-[#a64b2a]">!</div><h1 className="mt-5 font-display text-3xl text-[#4e2b1f]">Área privada</h1><p className="mt-3 text-sm leading-6 text-[#806f64]">La cuenta actual no tiene permiso. Cierra esta sesión y entra con <strong className="text-[#6e3824]">lizarazuricaldes0309@gmail.com</strong>.</p><Button onClick={changeGoogleAccount} className="mt-6 w-full rounded-full bg-[#a64b2a] py-3 text-white hover:bg-[#873b22]">Cambiar cuenta de Google</Button><Button variant="outline" onClick={() => window.location.assign("/")} className="mt-3 w-full rounded-full border-[#d9c7b7] text-[#6e3824]">Volver a la tienda</Button></div></div>;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  useEffect(() => { const move = (e: MouseEvent) => { if (!isResizing) return; const left = sidebarRef.current?.getBoundingClientRect().left ?? 0; const width = e.clientX - left; if (width >= 200 && width <= 420) setSidebarWidth(width); }; const up = () => setIsResizing(false); if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; } return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; }; }, [isResizing, setSidebarWidth]);
  const activeMenuItem = menuItems.find(item => item.path === location);
  return <><div ref={sidebarRef} className="relative"><Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}><SidebarHeader className="h-20 justify-center"><div className="flex items-center gap-3 px-2"><button onClick={toggleSidebar} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4e7d9] text-[#a64b2a]" aria-label="Mostrar u ocultar menú"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div><span className="font-display text-xl font-bold text-[#6e3824]">Panex</span><span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[#a88975]">admin bakery</span></div>}</div></SidebarHeader><SidebarContent><SidebarMenu className="px-2 py-1">{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 font-semibold"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-[#f4ede4]"><Avatar className="h-9 w-9 border border-[#eadfd2]"><AvatarFallback className="bg-[#f4e7d9] text-xs font-bold text-[#a64b2a]">{user?.name?.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-bold text-[#4e2b1f]">{user?.name || "Administrador"}</p><p className="mt-1 truncate text-xs text-[#a88975]">{user?.email || "Sesión activa"}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-[#a64b2a]"><LogOut className="mr-2 h-4 w-4" />Cerrar sesión</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><div className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#a64b2a]/20 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} /></div><SidebarInset>{isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[#eadfd2] bg-[#fffaf4]/95 px-2 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg" /><span className="font-semibold text-[#4e2b1f]">{activeMenuItem?.label ?? "Menú"}</span></div>}<main className="flex-1">{children}</main></SidebarInset></>;
}
