"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "./LanguageProvider";

export function ThemeToggleSimple() {
  const { t } = useLanguage();
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    // Check current theme
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    
    if (newTheme) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("crm-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("crm-theme", "light");
    }
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="lg"
        className="relative h-12 w-12 rounded-full border-2"
        disabled
      >
        <span className="sr-only">{t("theme.loading")}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={toggleTheme}
      className="relative h-12 w-12 rounded-full border-2 border-border bg-background hover:bg-accent transition-colors duration-200"
      aria-label={isDark ? t("theme.light") : t("theme.dark")}
    >
      <Sun 
        className={`h-6 w-6 absolute transition-all duration-200 ${
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon 
        className={`h-6 w-6 absolute transition-all duration-200 ${
          !isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
    </Button>
  );
}
