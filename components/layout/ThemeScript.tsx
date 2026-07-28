import Script from "next/script";

/**
 * Runs before hydration to avoid light/dark FOUC.
 * Must use next/script (beforeInteractive) — raw <script> in a React
 * component body triggers a console error and is not reliable on the client.
 */
const THEME_INIT = `(function(){try{var s=localStorage.getItem("crm-theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=!s||s==="system"?(d?"dark":"light"):s;document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;

export function ThemeScript() {
  return (
    <Script
      id="crm-theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: THEME_INIT }}
    />
  );
}
