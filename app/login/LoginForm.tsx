"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Ошибка входа");
      }

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="glass-card border-border/80 w-full max-w-md shadow-lg">
      <CardHeader className="border-b border-border/50 p-6 sm:p-7 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-[#ff8533] text-primary-foreground flex items-center justify-center shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spark.svg" alt="" className="h-7 w-7 object-contain brightness-0 invert" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">SPARK CRM</p>
            <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-tight">Вход в CRM</CardTitle>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Автосервис · Moldova</p>
      </CardHeader>
      <CardContent className="p-6 sm:p-7">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Логин</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11"
              required
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 accent-primary rounded"
            />
            Запомнить меня
          </label>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading} className="btn-garage h-11 w-full text-sm mt-1">
            <LogIn className="h-4 w-4" />
            {loading ? "Проверка..." : "Войти"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
