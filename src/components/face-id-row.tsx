"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight, Loader2, ScanFace, ShieldCheck, X } from "lucide-react";
import { platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { faceIdRemove, faceIdSetupFinish, faceIdSetupOptions } from "@/app/actions/passkeys";
import { PinPad } from "@/components/pin-pad";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { faceIdHere, forgetFaceIdHere, rememberFaceIdHere } from "@/lib/face-id";
import { cn } from "@/lib/utils";

type Options = Parameters<typeof startRegistration>[0]["optionsJSON"];
type Step = "status" | "pin" | "scan" | "done";

/**
 * Settings → Face ID (owner, Nov 12 2026): unlock the app with Face ID on this
 * device instead of typing the PIN. Turning it on asks for the PIN, then Face
 * ID makes a passkey for this site. The PIN keeps working as the fallback.
 */
export function FaceIdRow() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("status");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [here, setHere] = useState<string | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, start] = useTransition();
  const still = useReducedMotion();

  useEffect(() => {
    let live = true;
    platformAuthenticatorIsAvailable()
      .then((ok) => live && setSupported(ok))
      .catch(() => live && setSupported(false));
    const t = setTimeout(() => live && setHere(faceIdHere()), 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setStep("status");
    setOptions(null);
    setConfirmOff(false);
  };

  // The tap on "Use Face ID" goes straight to the prompt (the request was fetched after the PIN).
  const scan = () =>
    options &&
    start(async () => {
      try {
        const response = await startRegistration({ optionsJSON: options });
        const res = await faceIdSetupFinish(response, /iPhone/.test(navigator.userAgent) ? "iPhone" : /iPad/.test(navigator.userAgent) ? "iPad" : /Mac/.test(navigator.userAgent) ? "Mac" : "This device");
        if (!res.ok) return void toast.error(res.error);
        rememberFaceIdHere(res.id);
        setHere(res.id);
        setStep("done");
      } catch {
        toast.error("Face ID was cancelled. Try again when you're ready.");
      }
    });

  const turnOff = () => {
    if (!confirmOff) return setConfirmOff(true);
    start(async () => {
      if (here) await faceIdRemove(here);
      forgetFaceIdHere();
      setHere(null);
      setConfirmOff(false);
      toast.success("Face ID is off on this device");
    });
  };

  const subtitle = supported === false ? "Not available on this device" : here ? "On for this device" : "Unlock with Face ID instead of your PIN";
  const option = "flex w-full items-center gap-3 rounded-xl bg-surface-1 px-3 py-3 text-left ring-1 ring-border transition-colors duration-(--duration-fast) hover:bg-surface-2 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <ScanFace className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Face ID</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">{step === "pin" ? "Enter your PIN" : "Face ID"}</SheetTitle>
              <SheetDescription className="text-xs">
                {step === "pin"
                  ? "To turn on Face ID, confirm it's you."
                  : "Open the app with Face ID on this device. Your PIN keeps working whenever Face ID can't."}
              </SheetDescription>
            </div>

            {step === "status" &&
              (supported === false ? (
                <p className="rounded-xl bg-surface-1 px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-border">
                  This device or browser can&apos;t use Face ID here. On iPhone, open Kharcha-Paani from your Home Screen.
                </p>
              ) : here ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl bg-surface-1 px-3 py-3 ring-1 ring-border">
                    <ShieldCheck className="size-4 text-money-in" />
                    <span className="flex-1 text-sm">On for this device</span>
                  </div>
                  <button type="button" onClick={turnOff} disabled={busy} className={option}>
                    <X className="size-4 text-budget-over" />
                    <span className="flex-1 text-sm font-medium text-budget-over">{confirmOff ? "Tap again to turn it off" : "Turn off on this device"}</span>
                    {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setStep("pin")} disabled={supported === null} className={option}>
                  <ScanFace className="size-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">Turn on Face ID</span>
                    <span className="block text-xs text-muted-foreground">You&apos;ll enter your PIN, then look at your phone</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}

            {step === "pin" && (
              <div className="flex justify-center">
                <PinPad
                  check={async (pin) => {
                    const res = await faceIdSetupOptions(pin);
                    if (!res.ok) return res.error;
                    setOptions(res.options);
                    setStep("scan");
                    return null;
                  }}
                />
              </div>
            )}

            {step === "scan" && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <motion.span
                  animate={still ? undefined : { scale: [1, 1.06, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="grid size-20 place-items-center rounded-3xl bg-surface-1 ring-1 ring-border"
                >
                  <ScanFace className="size-9 text-lime-ink" />
                </motion.span>
                <p className="text-sm text-muted-foreground">Tap below and look at your phone.</p>
                <button type="button" onClick={scan} disabled={busy} className={cn(option, "justify-center text-sm font-medium")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4 text-lime-ink" />} Use Face ID
                </button>
              </div>
            )}

            {step === "done" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 pt-2 text-center" role="status">
                <motion.span
                  initial={still ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                  className="grid size-20 place-items-center rounded-full bg-money-in/15"
                >
                  <ShieldCheck className="size-9 text-money-in" />
                </motion.span>
                <div>
                  <p className="text-base font-semibold">Face ID is on</p>
                  <p className="mt-1 text-xs text-muted-foreground">Next time the app locks, it&apos;ll ask for Face ID first.</p>
                </div>
                <button type="button" onClick={close} className={cn(option, "mt-2 justify-center text-sm font-medium")}>
                  Done
                </button>
              </motion.div>
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
