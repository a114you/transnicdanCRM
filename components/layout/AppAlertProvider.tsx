"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/components/layout/LanguageProvider";

type AlertVariant = "info" | "success" | "warning" | "error";

interface AlertOptions {
  title?: string;
  message: string;
  variant?: AlertVariant;
  confirmText?: string;
}

interface ConfirmOptions extends AlertOptions {
  cancelText?: string;
  destructive?: boolean;
}

interface AlertState extends AlertOptions {
  type: "alert" | "confirm";
  cancelText?: string;
  destructive?: boolean;
  resolve?: (value: boolean) => void;
}

interface AppAlertContextValue {
  showAlert: (message: string, options?: Omit<AlertOptions, "message">) => void;
  showConfirm: (message: string, options?: Omit<ConfirmOptions, "message">) => Promise<boolean>;
}

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

const variantConfig = {
  info: {
    icon: Info,
    className: "bg-primary/10 text-primary ring-primary/20",
  },
  success: {
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  },
  warning: {
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  },
  error: {
    icon: XCircle,
    className: "bg-destructive/10 text-destructive ring-destructive/20",
  },
};

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const { tp } = useLanguage();
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const close = useCallback((result = false) => {
    setAlertState((current) => {
      current?.resolve?.(result);
      return null;
    });
  }, []);

  const showAlert = useCallback<AppAlertContextValue["showAlert"]>((message, options = {}) => {
    setAlertState({
      type: "alert",
      message,
      variant: options.variant || "info",
      title: options.title,
      confirmText: options.confirmText,
    });
  }, []);

  const showConfirm = useCallback<AppAlertContextValue["showConfirm"]>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setAlertState({
        type: "confirm",
        message,
        variant: options.variant || (options.destructive ? "warning" : "info"),
        title: options.title,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        destructive: options.destructive,
        resolve,
      });
    });
  }, []);

  const value = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);
  const variant = alertState?.variant || "info";
  const Icon = variantConfig[variant].icon;

  return (
    <AppAlertContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(alertState)} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pr-8">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${variantConfig[variant].className}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle>
                  {alertState?.title || (alertState?.type === "confirm" ? tp("Подтвердите действие") : tp("Уведомление"))}
                </DialogTitle>
                <DialogDescription className="leading-6 text-foreground/80">
                  {alertState?.message}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {alertState?.type === "confirm" && (
              <Button type="button" variant="outline" onClick={() => close(false)} className="h-10 rounded-lg px-4">
                {alertState.cancelText || tp("Отмена")}
              </Button>
            )}
            <Button
              type="button"
              variant={alertState?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              className="h-10 rounded-lg px-4"
            >
              {alertState?.confirmText || (alertState?.type === "confirm" ? tp("Подтвердить") : tp("OK"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const context = useContext(AppAlertContext);
  if (!context) {
    throw new Error("useAppAlert must be used inside AppAlertProvider");
  }
  return context;
}
