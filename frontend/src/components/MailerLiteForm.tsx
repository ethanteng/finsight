"use client";
import { useEffect } from "react";

export default function MailerLiteForm() {
  useEffect(() => {
    if (!document.getElementById("mailerlite-universal")) {
      const script = document.createElement("script");
      script.id = "mailerlite-universal";
      script.innerHTML = `
        (function(w,d,e,u,f,l,n){w[f]=w[f]||function(){(w[f].q=w[f].q||[])
        .push(arguments);},l=d.createElement(e),l.async=1,l.src=u,
        n=d.getElementsByTagName(e)[0],n.parentNode.insertBefore(l,n);})
        (window,document,'script','https://assets.mailerlite.com/js/universal.js','ml');
        ml('account', '1687893');
      `;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div
      className="ml-embedded"
      data-form="Bq5256"
      style={{ minHeight: 200, width: "100%", maxWidth: 400, margin: "0 auto" }}
    />
  );
} 