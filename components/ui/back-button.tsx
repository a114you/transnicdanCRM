"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton({ href, label, ariaLabel }: { href: string; label?: string; ariaLabel?: string }) {
  const router = useRouter();

  function handleBack(e: React.MouseEvent) {
    // If there's history to go back to, use it
    if (window.history.length > 2) {
      e.preventDefault();
      router.back();
    }
    // Otherwise fall through to the Link href
  }

  return (
    <Link href={href} aria-label={ariaLabel || label} onClick={handleBack}>
      <Button variant="outline" size="icon" aria-label={ariaLabel || label} className="h-10 w-10 flex-shrink-0 rounded-xl">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </Link>
  );
}
