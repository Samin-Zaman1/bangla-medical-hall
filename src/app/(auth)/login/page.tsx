import { Suspense } from "react";
import Image from "next/image";
import {
  CalendarClock,
  ChartColumn,
  HeartPulse,
  Pill,
  Receipt,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Tablets,
  Wallet,
} from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

const MASCOT_SRC = "/images/pharmacy-mascot-logo.svg";

const features = [
  { icon: Receipt, title: "Quick billing", text: "Ring up sales in seconds at the counter" },
  { icon: CalendarClock, title: "Stock & expiry", text: "Know what's running low or expiring soon" },
  { icon: Wallet, title: "Baki tracking", text: "Keep customer credit and payments in order" },
  { icon: ChartColumn, title: "Daily reports", text: "See sales and profit at a glance" },
];

// Faint background icons scattered over the brand panel.
const decorations = [
  { icon: Pill, className: "left-[8%] top-[10%] size-10 rotate-12" },
  { icon: Syringe, className: "right-[10%] top-[18%] size-9 -rotate-12" },
  { icon: Tablets, className: "left-[14%] bottom-[22%] size-11 -rotate-6" },
  { icon: Stethoscope, className: "right-[8%] bottom-[12%] size-12 rotate-6" },
  { icon: HeartPulse, className: "right-[30%] top-[6%] size-8" },
];

export default function LoginPage() {
  const year = new Date().getFullYear();

  return (
    <main className="grid min-h-full flex-1 bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#14532D] via-[#1F7A4D] to-[#059669] p-12 text-white lg:flex lg:flex-col">
        {decorations.map(({ icon: Icon, className }, i) => (
          <Icon key={i} aria-hidden className={`pointer-events-none absolute text-white/10 ${className}`} />
        ))}
        <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-white/5" />

        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white shadow-md">
            <Image src={MASCOT_SRC} alt="" width={36} height={36} />
          </div>
          <div>
            <p className="text-lg font-semibold leading-tight">Bangla Medical Hall</p>
            <p className="text-sm text-white/70">বাংলা মেডিকেল হল</p>
          </div>
        </div>

        <div className="relative my-auto flex flex-col items-center py-10 text-center">
          <div className="flex size-64 items-center justify-center rounded-full bg-white shadow-2xl shadow-black/20 ring-8 ring-white/15 xl:size-72">
            <Image src={MASCOT_SRC} alt="Bangla Medical Hall mascot" width={260} height={260} priority />
          </div>
          <h2 className="mt-10 text-4xl font-bold tracking-tight xl:text-5xl">
            Your trusted neighbourhood pharmacy
          </h2>
          <p className="mt-4 max-w-md text-lg text-white/80">
            Sales, stock, credit and reports — everything the counter needs, in one place.
          </p>
        </div>

        <ul className="relative grid grid-cols-2 gap-4">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <Icon className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-white/75">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-lg">
          {/* Compact brand header for small screens, where the brand panel is hidden */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="flex size-32 items-center justify-center rounded-full bg-accent shadow-inner">
              <Image src={MASCOT_SRC} alt="Bangla Medical Hall mascot" width={120} height={120} priority />
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">Bangla Medical Hall</p>
            <p className="text-sm text-muted-foreground">বাংলা মেডিকেল হল</p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8 shadow-xl shadow-black/[0.04] sm:p-12">
            <div className="mb-8 space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Welcome back</h1>
              <p className="text-base text-muted-foreground">
                Choose your name and enter your PIN to open the counter.
              </p>
            </div>
            <Suspense fallback={<p className="text-base text-muted-foreground">Loading…</p>}>
              <LoginForm />
            </Suspense>
          </div>

          <div className="mt-8 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Your PIN is private — never share it with anyone.
            </p>
            <p>© {year} Bangla Medical Hall</p>
          </div>
        </div>
      </section>
    </main>
  );
}
