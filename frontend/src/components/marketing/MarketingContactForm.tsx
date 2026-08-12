"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type ContactFormData = {
  firstName: string;
  email: string;
  topic: string;
  message: string;
};

const initialFormData: ContactFormData = {
  firstName: "",
  email: "",
  topic: "Product question",
  message: "",
};

export function MarketingContactForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: keyof ContactFormData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const message = [
      formData.firstName.trim() ? `Name: ${formData.firstName.trim()}` : null,
      `Topic: ${formData.topic}`,
      "",
      formData.message.trim(),
    ].filter((line) => line !== null).join("\n");

    try {
      const response = await fetch(`${API_URL}/auth/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email.trim(), message }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "Failed to send message. Please try again.");
      }

      setFormData(initialFormData);
      setIsSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error
        ? submissionError.message
        : "Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="contact-form contact-form-success" role="status" aria-live="polite">
        <span className="contact-success-mark" aria-hidden="true">✓</span>
        <p className="section-kicker">MESSAGE SENT</p>
        <h2>Thanks for reaching out.</h2>
        <p>Your message is on its way. You can expect a reply within one business day.</p>
        <button
          className="button button-dark"
          type="button"
          onClick={() => setIsSubmitted(false)}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
      <div className="field-row">
        <label htmlFor="contact-first-name">
          FIRST NAME
          <input
            id="contact-first-name"
            name="firstName"
            autoComplete="given-name"
            maxLength={100}
            placeholder="Ethan"
            value={formData.firstName}
            onChange={(event) => updateField("firstName", event.target.value)}
          />
        </label>
        <label htmlFor="contact-email">
          EMAIL
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
            required
            value={formData.email}
            onChange={(event) => updateField("email", event.target.value)}
          />
        </label>
      </div>
      <label htmlFor="contact-topic">
        WHAT CAN WE HELP WITH?
        <select
          id="contact-topic"
          name="topic"
          value={formData.topic}
          onChange={(event) => updateField("topic", event.target.value)}
        >
          <option>Product question</option>
          <option>Privacy or data request</option>
          <option>Technical support</option>
          <option>Press or partnership</option>
          <option>Something else</option>
        </select>
      </label>
      <label htmlFor="contact-message">
        MESSAGE
        <textarea
          id="contact-message"
          name="message"
          rows={7}
          minLength={10}
          maxLength={1800}
          placeholder="Tell us what’s on your mind…"
          required
          value={formData.message}
          onChange={(event) => updateField("message", event.target.value)}
        />
      </label>
      {error && <p className="contact-form-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? <><span className="button-spinner" aria-hidden="true" />Sending…</> : <>Send message <span aria-hidden="true">→</span></>}
      </button>
      <small>By sending this form, you agree that Ask Linc may reply to your email.</small>
    </form>
  );
}
