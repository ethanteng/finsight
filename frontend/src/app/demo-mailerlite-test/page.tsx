"use client";
import { useEffect } from "react";

export default function DemoMailerLiteTest() {
  useEffect(() => {
    // Inject MailerLite script only once
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <h1>MailerLite Embed Test</h1>
      <div className="ml-embedded" data-form="Bq5256" style={{ minHeight: 200, width: 400, border: "1px dashed #ccc", marginTop: 32 }} />
      <p style={{ marginTop: 24, color: '#888' }}>If the form does not appear, the issue is with MailerLite or your account, not your code.</p>
    </div>
  );
} 